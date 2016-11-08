'use strict';

// node core modules
const assert = require('assert');

// 3rd party modules
const _ = require('lodash');

// internal modules
const loggerFactory = require('./logger-factory');

const {
  LimiterError,
  CreateBucketError,
  BucketExistsError,
  InvalidBucketError,
  BucketEmptyError,
} = require('./errors');


// variables and functions
const moduleName = 'oniyi-limiter';
const factoryDefaults = {
  limit: 2500,
  duration: 60000, // these are milliseconds
};

function oniyiLimiterFactory(factoryParams = {}) {
  // prepare options with defaults
  const options = _.defaultsDeep({},
    // only allow supported params
    _.pick(factoryParams, ['id', 'useLocalFallback', 'redisClient', 'limit', 'duration']),
    factoryDefaults
  );

  // destruct frequently used options members
  const { redisClient, id, duration, limit } = options;

  // verify params
  assert(id && _.isString(id), '`factoryParams.id` is required');
  assert(redisClient, '`factoryParams.redisClient` is required');

  const logger = loggerFactory(id);
  // construct redis key (this is where we store the bucket information as redis hash)
  const key = `${moduleName}:${id}:`;
  let localBucket = null;

  function createBucket(callback) {
    const expiresAt = Date.now() + duration;

    // checking if we have a bucket in redis already
    redisClient.exists(key, (existsError, exists) => {
      if (existsError) {
        const error = new LimiterError(existsError, id);
        callback(error);
        return;
      }

      if (exists === 1) {
        const error = new BucketExistsError(new Error('A bucket exists already'), id);
        callback(error);
        return;
      }

      // we don't have a bucket. Let's create one!
      const bucket = {
        limit,
        remaining: limit,
        reset: expiresAt,
      };

      redisClient.multi()
        .hmset(key, bucket)
        .pexpireat(key, expiresAt)
        .exec((multiError, results) => {
          // check for any unexpected results from executing the multi redis command
          if (multiError) {
            const error = new LimiterError(multiError, id);
            callback(error);
            return;
          }

          if (!Array.isArray(results) || results.length !== 2) {
            const message = [
              'unexpected response when creating bucket.',
              'expected: type: "Array" with ".length() === 2",',
              `actual: type: "${typeof results}"" length: ${Array.isArray(results) ? results.length : NaN}`,
            ].join(' ');

            logger.debug(message);
            const error = new CreateBucketError(new TypeError(message), id);

            callback(error);
            return;
          }

          const [hmsetResult, expireAtResult] = results;
          if (hmsetResult !== 'OK') {
            const message = `Storing bucket hash in redis failed with result {${hmsetResult}}`;

            logger.debug(message);
            const error = new CreateBucketError(new Error(message), id);

            callback(error);
            return;
          }

          if (expireAtResult !== 1) {
            const message = `Setting expiry timestamp for bucket in redis failed with result {${expireAtResult}}`;

            logger.debug(message);
            const error = new CreateBucketError(new Error(message), id);

            callback(error);
            return;
          }

          // when we got to this point, the bucket was created successfully.
          logger.debug(
            '{%s} - created new bucket: remaining {%s}; limit {%s}, reset {%s}',
            id, limit - 1, limit, new Date(parseInt(expiresAt, 10))
          );

          callback(null, bucket);
          return;
        });
    });
  }

  function throttle(callback) {
    // fallback to a local bucket implementation (in memory) when redisClient is not connected
    // skip this if local fallback was not explicitly enabled
    // @TODO: is this necessary? We can also disable the queue command on our redis client.
    // Downside: redisClient might not be explicit for Oniyi-Limiter

    if (!redisClient.connected && options.useLocalFallback) {
      logger.debug('%s - redisClient is not connected. using fallback to local bucket', id);
      if (!localBucket) {
        localBucket = {
          limit,
          remaining: limit,
          reset: Date.now() + duration,
        };

        // remove the local bucket after the configured expiry time
        setTimeout(() => {
          localBucket = null;
        }, duration);
      }

      callback(null, localBucket);
      return;
    }

    redisClient.exists(key, (existsError, result) => {
      if (existsError) {
        const error = new LimiterError(existsError, id);
        callback(error);
        return;
      }

      // we don't have a bucket
      // create one and pass on the callback
      if (result !== 1) {
        createBucket((createBucketErr) => {
          // in case we get an error... and it is not an error telling us that a bucket exists already,
          // pass the error to the callback
          // this is a very rare case.
          // It is only possible if between entering the throttle functiond and calling the createBucket,
          // another request caused a new bucket to be created
          if (createBucketErr && !(createBucketErr instanceof BucketExistsError)) {
            callback(createBucketErr);
            return;
          }

          // a bucket has been created now.
          // call "throttle" again to execute the initial request
          throttle(callback);
          return;
        });
      }

      redisClient.multi()
        .hincrby(key, 'remaining', -1)
        .hgetall(key)
        .exec((multiError, results) => {
          if (multiError) {
            const error = new LimiterError(multiError, id);
            callback(error);
            return;
          }

          if (!Array.isArray(results) || results.length !== 2) {
            const message = [
              'unexpected response when receiving bucket from redis.',
              'expected: type: \'Array\' with \'.length() === 2\',',
              `actual: type: '${typeof results}' length: ${Array.isArray(results) ? results.length : NaN}`,
            ].join(' ');

            logger.debug(message);
            const error = new InvalidBucketError(new TypeError(message), id);

            callback(error);
            return;
          }

          const [, bucket] = results;
          // disabling this verification. We assume no data manipulation.
          // If anyone modifies our hash in redis manually, it's okay to break the application.

          // if (!_.isPlainObject(bucket)) {
          //   error = new InvalidBucketError(
          //     new TypeError(
          //       util.format(
          //         'Unexpexted response type when receiving bucket from redis (should be a plain object). Received type: {%s}',
          //         typeof bucket)
          //     ), self.id);

          //   callback(error);
          //   return deferred.reject(error);
          // }

          // no "remaining" left
          if (bucket.remaining < 0) {
            logger.debug('{%s} - Bucket limit {%d} reached, you have {%d} remaining calls in this period',
              id, bucket.limit, 0
            );

            const error = new BucketEmptyError(bucket, id);
            callback(error);
            return;
          }

          callback(null, bucket);
          return;
        });
    });
  }

  return {
    createBucket,
    throttle,
  };
}

module.exports = oniyiLimiterFactory;
