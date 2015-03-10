'use strict';

// node core
var assert = require('assert');
var util = require('util');

// 3rd party
var _ = require('lodash'),
	q = require('q'),
	makeRedisClient = require('make-redis-client'),
	debug = require('debug');

// internal dependencies
var LimiterError = require('./errors/LimiterError');

// variables and functions
var moduleName = 'oniyi-limiter';

var logError = debug(moduleName + ':error');
// set this namespace to log via console.error
logError.log = console.error.bind(console); // don't forget to bind to console!

var logWarn = debug(moduleName + ':warn');
// set all output to go via console.warn
logWarn.log = console.warn.bind(console);

var logDebug = debug(moduleName + ':debug');
// set all output to go via console.warn
logDebug.log = console.warn.bind(console);

function OniyiLimiter(args) {
	var self = this;
	// when there is only a string provided, take this as our id
	if (_.isString(args)) {
		args = {
			id: args
		};
	}

	// make sure args is a plain object
	if (!_.isPlainObject(args)) {
		args = {};
	}

	var opts = _.merge({
		limit: 2500,
		duration: 60000, // these are milliseconds
	}, _.pick(args, ['id', 'redisClient', 'limit', 'duration']));

	if (!opts.redisClient) {
		opts.redisClient = makeRedisClient(_.merge((args.redis || {}), {
			logDebug: logDebug,
			logError: logError
		}));
	}

	// check pre-requisites
	assert(opts.id, '.id required');
	assert(opts.redisClient, '.redisClient required');

	// construct redis key (this is where we store the bucket information as redis hash)
	opts.key = util.format('%s:%s:', moduleName, opts.id);

	// merge collected / computed properties into this Limiter instance
	_.merge(self, opts);

	logDebug('Created a new limiter instance: %s', opts.id);
}

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

	if (!_.isFunction(callback)) {
		callback = _.noop;
	}

	self.redisClient.exists(self.key, function(err, result) {
		if (err) {
			error = new LimiterError('OL-E 001', self.id, err);
			callback(error);
			return deferred.reject(error);
		}
		if (result === 1) {
			error = new LimiterError('OL-E 004', self.id, 'found existing bucket');
			callback(err);
			return deferred.reject(error);
		}

		self.redisClient.multi()
			.hmset(self.key, {
				limit: self.limit,
				remaining: self.limit - 1,
				reset: expiresAt
			})
			.pexpireat(self.key, expiresAt)
			.exec(function(err, results) {
				if (err) {
					error = new LimiterError('OL-E 001', self.id, err);
					callback(error);
					return deferred.reject(error);
				}

				if (!_.isArray(results) || results.length !== 2) {
					error = new LimiterError('OL-E 001', self.id, 'results is not an array or has wrong length');
					callback(error);
					return deferred.reject(error);
				}

				if (results[0] !== 'OK') {
					error = new LimiterError('OL-E 001', self.id, 'storing bucket object failed');
					callback(error);
					return deferred.reject(error);
				}

				if (results[1] !== 1) {
					error = new LimiterError('OL-E 001', self.id, 'setting expiry timestamp for bucket failed');
					callback(error);
					return deferred.reject(error);
				}

				// when we got to this point, that means we successfully created our bucket.

				logDebug('{%s} - created new bucket: remaining {%s}; limit {%s}, reset {%s}', self.id, self.limit - 1, self.limit, new Date(parseInt(expiresAt, null)));

				var bucket = {
					remaining: self.limit - 1,
					limit: self.limit,
					reset: expiresAt
				};

				callback(null, bucket);
				return deferred.resolve(bucket);
			});

	});

	return deferred.promise;
};

OniyiLimiter.prototype.getBucket = function(callback) {
	var self = this;
	var error;
	var deferred = q.defer();

	if (!_.isFunction(callback)) {
		callback = _.noop;
	}

	if (!self.redisClient.connected) {
		logWarn('%s - redisClient is not connected. using fallback to local bucket', self.id);
		// using a fallback to a local bucket implementation (in memory) when redisClient is not connected
		if (!self.localBucket) {
			self.localBucket = {
				remaining: self.limit,
				limit: self.limit,
				reset: Date.now() + self.duration
			};

			// remove the local bucket after the configured duration
			setTimeout(function() {
				self.localBucket = null;
			}, self.duration);
		}

		self.localBucket.remaining--;

		callback(null, self.localBucket);
		return q(self.localBucket);
	}


	self.redisClient.exists(self.key, function(err, result) {
		if (err) {
			error = new LimiterError('OL-E 001', self.id, err);
			callback(error);
			return deferred.reject(error);
		}
		if (result !== 1) {
			// we don't have a bucket yet, let's create one
			return deferred.resolve(self.createBucket(callback));
		}

		self.redisClient.multi()
			.hincrby(self.key, 'remaining', -1)
			.hgetall(self.key)
			.exec(function(err, results) {
				if (err) {
					error = new LimiterError('OL-E 001', self.id, err);
					callback(error);
					return deferred.reject(error);
				}

				if (!_.isArray(results) || results.length !== 2) {
					error = new LimiterError('OL-E 005', self.id, 'results is not an array or has wrong length');
					callback(error);
					return deferred.reject(error);
				}

				if (!_.isPlainObject(results[1])) {
					error = new LimiterError('OL-E 005', self.id, 'bucket has wrong format');
					callback(error);
					return deferred.reject(error);
				}

				// no "remaining" left
				if (results[1].remaining < 0) {
					logDebug('{%s} - Bucket limit {%d} reached, you have {%s} remaining calls in this period', self.id, results[1].limit, 0);

					// normalize negative remaining values to -1
					results[1].remaining = -1;
				}

				callback(null, results[1]);
				return deferred.resolve(results[1]);
			});

	});

	return deferred.promise;
};

module.exports = OniyiLimiter;