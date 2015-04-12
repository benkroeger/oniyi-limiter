'use strict';

// node core
var assert = require('assert');
var util = require('util');

// 3rd party
var q = require('q'),
  makeRedisClient = require('make-redis-client');


// internal dependencies
var LimiterError = require('./errors/LimiterError'),
  CreateBucketError = require('./errors/CreateBucketError'),
  BucketExistsError = require('./errors/BucketExistsError'),
  InvalidBucketError = require('./errors/InvalidBucketError'),
  BucketEmptyError = require('./errors/BucketEmptyError');

// variables and functions
var moduleName = 'oniyi-limiter';

// have a placeholder no-op function
function noop() {}


function OniyiLimiter(args) {
  var self = this;
  // when there is only a string provided, take this as our id
  if (typeof args === 'string') {
    args = {
      id: args
    };
  }

  var opts = {
    id: args.id,
    limit: args.limit || 2500,
    duration: args.duration || 60000, // these are milliseconds
    useLocalFallback: !!args.useLocalFallback,
    redisClient: args.redisClient
  };

  if (!opts.redisClient) {
    opts.redisClient = makeRedisClient(args.redis || {});
  }

  // check pre-requisites
  assert(opts.id, '.id required');
  assert(opts.redisClient, '.redisClient required');

  // construct redis key (this is where we store the bucket information as redis hash)
  opts.key = util.format('%s:%s:', moduleName, opts.id);

  // merge collected / computed properties into this Limiter instance
  util._extend(self, opts);
}

// Debugging
OniyiLimiter.debug = process.env.NODE_DEBUG && /\boniyi-limiter\b/.test(process.env.NODE_DEBUG);

function debug() {
  if (OniyiLimiter.debug) {
    console.error('OniyiLimiter %s', util.format.apply(util, arguments));
  }
}

// Prototype definitions
OniyiLimiter.prototype.inspect = function() {
  return JSON.stringify({
    id: this.id,
    duration: this.duration,
    limit: this.limit
  });
};

OniyiLimiter.prototype.createBucket = function(callback) {
  var self = this;
  var error;
  var deferred = q.defer();
  var expiresAt = Date.now() + self.duration;

  if (typeof callback !== 'function') {
    callback = noop;
  }

  // checking if we have a bucket in redis already
  self.redisClient.exists(self.key, function(err, result) {
    if (err) {
      error = new LimiterError(err, self.id);
      callback(error);
      return deferred.reject(error);
    }
    if (result === 1) {
      error = new BucketExistsError(new Error('A bucket exists already'), self.id);
      callback(err);
      return deferred.reject(error);
    }

    // we don't have a bucket. Let's create one!
    var bucket = {
      remaining: self.limit,
      limit: self.limit,
      reset: expiresAt
    };

    self.redisClient.multi()
      .hmset(self.key, bucket)
      .pexpireat(self.key, expiresAt)
      .exec(function(err, results) {
      	// check for any unexpected results from executing the multi redis command
        if (err) {
          error = new LimiterError(err, self.id);
          callback(error);
          return deferred.reject(error);
        }

        if (!util.isArray(results) || results.length !== 2) {
          error = new CreateBucketError(
            new TypeError(
              util.format(
                'Received unexpexted response format when creating bucket (should be an array of length = 2). is array: {%s}, length: {%d}',
                util.isArray(results), (util.isArray(results) ? results.length : NaN)
              )
            ), self.id);

          callback(error);
          return deferred.reject(error);
        }

        if (results[0] !== 'OK') {
          error = new CreateBucketError(
            new Error(
              util.format('Storing bucket hash in redis failed with result {%s}',
                results[0]
              )
            ), self.id);

          callback(error);
          return deferred.reject(error);
        }

        if (results[1] !== 1) {
          error = new CreateBucketError(
            new Error(
              util.format('Setting expiry timestamp for bucket in redis failed with result {%s}',
                results[1]
              )
            ), self.id);

          callback(error);
          return deferred.reject(error);
        }

        // when we got to this point, the bucket was created successfully.
        debug('{%s} - created new bucket: remaining {%s}; limit {%s}, reset {%s}', self.id, self.limit - 1, self.limit, new Date(parseInt(expiresAt, null)));

        callback(null, bucket);
        return deferred.resolve(bucket);
      });
  });

  return deferred.promise;
};

OniyiLimiter.prototype.throttle = function(callback) {
  var self = this;
  var error;
  var deferred = q.defer();

  if (typeof callback !== 'function') {
    callback = noop;
  }

  // fallback to a local bucket implementation (in memory) when redisClient is not connected
  // skip this if local fallback was not explicitly enabled
  // @TODO: is this necessary? We can also disable the queue command on our redis client.
  // Downside: redisClient might not be explicit for Oniyi-Limiter
  
  if (!self.redisClient.connected && self.useLocalFallback) {
    debug('%s - redisClient is not connected. using fallback to local bucket', self.id);
    if (!self.localBucket) {
      self.localBucket = {
        remaining: self.limit,
        limit: self.limit,
        reset: Date.now() + self.duration
      };

      // remove the local bucket after the configured expiry time
      setTimeout(function() {
        self.localBucket = null;
      }, self.duration);
    }

    callback(null, self.localBucket);
    return q(self.localBucket);
  }

  self.redisClient.exists(self.key, function(err, result) {
    if (err) {
      error = new LimiterError(err, self.id);
      callback(error);
      return deferred.reject(error);
    }

    // we don't have a bucket
    // create one and pass on the callback
    if (result !== 1) {
    	return self.createBucket(function(err){
    		// in case we get an error... and it is not an error telling us that a bucket exists already,
    		// pass the error to the callback
    		// this should only happen very rare cases.
    		// It is only possible if between entering the throttle functiond and calling the createBucket,
    		// another request caused a new bucket to be created
    		if (err && !(err instanceof BucketExistsError)) {
    			callback(err);
    			return deferred.reject(err);
    		}

    		// a bucket has been created now.
    		// call "throttle" again to execute the initial request
    		deferred.resolve(self.throttle(callback));
    	});
    }

    self.redisClient.multi()
      .hincrby(self.key, 'remaining', -1)
      .hgetall(self.key)
      .exec(function(err, results) {
        if (err) {
          error = new LimiterError(err, self.id);
          callback(error);
          return deferred.reject(error);
        }

        if (!util.isArray(results) || results.length !== 2) {
          error = new InvalidBucketError(
            new TypeError(
              util.format(
                'Unexpexted response format when receiving bucket from redis (should be an array of length = 2). is array: {%s}, length: {%d}',
                util.isArray(results), (util.isArray(results) ? results.length : NaN)
              )
            ), self.id);

          callback(error);
          return deferred.reject(error);
        }

        // disabling this verification. We assume no data manipulation.
        // If anyone modifies our hash in redis manually, it's okay to break the application.

        // if (!_.isPlainObject(results[1])) {
        //   error = new InvalidBucketError(
        //     new TypeError(
        //       util.format(
        //         'Unexpexted response type when receiving bucket from redis (should be a plain object). Received type: {%s}',
        //         typeof results[1])
        //     ), self.id);

        //   callback(error);
        //   return deferred.reject(error);
        // }

        // no "remaining" left
        if (results[1].remaining < 0) {
          debug('{%s} - Bucket limit {%d} reached, you have {%s} remaining calls in this period', self.id, results[1].limit, 0);

          error = new BucketEmptyError(results[1], self.id);
          callback(error);
          return deferred.reject(error);
        }

        callback(null, results[1]);
        return deferred.resolve(results[1]);
      });
  });

  return deferred.promise;
};

// deprecation notice
OniyiLimiter.prototype.getBucket = util.deprecate(function(callback){
	return this.throttle(callback);
}, '"OniyiLimiter.getBucket" is deprecated as of version 0.0.9! Use "OniyiLimter.throttle" instead');

module.exports = OniyiLimiter;
