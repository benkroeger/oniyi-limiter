'use strict';

// node core
var assert = require('assert');
var util = require('util');

// 3rd party
var _ = require('lodash'),
	q = require('q'),
	redis = require('redis'),
	debug = require('debug');

// internal dependencies
var LimiterError = require('./errors/LimiterError');

// variables and functions
var moduleName = 'oniyi-limiter';

var validRedisOptions = [
	'unixSocket', // if this is presented, host and port are ignored
	'host',
	'port',
	'parser',
	'return_buffers',
	'detect_buffers',
	'socket_nodelay',
	'socket_keepalive',
	'no_ready_check',
	'enable_offline_queue',
	'retry_max_delay',
	'retry_max_delay',
	'connect_timeout',
	'max_attempts',
	'auth_pass',
	'family'
];

var logError = debug(moduleName + ':error');
// set this namespace to log via console.error
logError.log = console.error.bind(console); // don't forget to bind to console!

var logWarn = debug(moduleName + ':warn');
// set all output to go via console.warn
logWarn.log = console.warn.bind(console);

var logDebug = debug(moduleName + ':debug');
// set all output to go via console.warn
logDebug.log = console.warn.bind(console);

function makeRedisClient(options) {
	var redisClient;
	// make unixSocket superseed host and port information
	if (options.unixSocket) {
		redisClient = redis.createClient(options.unixSocket, options);
	} else {
		redisClient = redis.createClient(options.port, options.host, options);
	}

	redisClient.on('error', function(err) {
		logError('Failed to connecto to redis: %j', options);
		logDebug(err);
	});
	
	return redisClient;
}

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
		opts.redisClient = makeRedisClient(_.merge({
			host: '127.0.0.1',
			port: 6379,
			max_attempts: 5,
			retry_max_delay: 5000
		}, _.pick(args.redis || {}, validRedisOptions)));
	}

	// check pre-requisites
	assert(opts.id, '.id required');
	assert(opts.redisClient, '.redisClient required');

	// construct redis key prefix
	opts.prefix = util.format('%s:%s:', moduleName, opts.id);

	// construct related redis keys
	opts.keys = {
		remaining: opts.prefix + 'remaining',
		limit: opts.prefix + 'limit',
		reset: opts.prefix + 'reset'
	};

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

	self.redisClient.multi()
		// No need to set expiry on the "remaining" key --> since we're using "decr" in the getBucket function,
		// it would be created when not exists anyway
		// more importantly, we must not expect that the "remaining" key does not exist ("NX" option).
		.set(self.keys.remaining, self.limit - 1)
		.set(self.keys.limit, self.limit, 'PX', self.duration, 'NX')
		.set(self.keys.reset, expiresAt, 'PX', self.duration, 'NX')
		.exec(function(err, res) {
			if (err) {
				error = new LimiterError('OL-E 001', self.id, err);
				callback(error);
				return deferred.reject(error);
			}

			if (!res || !res[1] || !res[2]) {
				// At least one of the keys we tried to create exists in redis already.
				// That means we have an active bucket
				// In this case, we delegate to getBucket

				logDebug('{%s} - Failed to create new bucket. Redis command results: remaining {%s}; limit {%s}, reset {%s}', self.id, res[0], res[2], res[2]);

				return deferred.resolve(self.getBucket(callback));
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

	return deferred.promise;
};

OniyiLimiter.prototype.getBucket = function(callback) {
	var self = this;
	var error, bucket;
	var deferred = q.defer();

	if (!_.isFunction(callback)) {
		callback = _.noop;
	}

	if (!self.redisClient.connected) {
		error = new LimiterError('OL-E 002', self.id, new Error('redisClient is not connected'));
		callback(error, null);
		return q.reject(error);

		// @TODO: implement and test fallback bucket
		// if (!self.localBucket) {
		// 	self.localBucket = {
		// 		remaining: self.limit,
		// 		limit: self.limit,
		// 		reset: Date.now() + self.duration
		// 	};
		// 	setTimeout(function() {
		// 		delete self.localBucket;
		// 	}, self.duration);
		// }

		// self.localBucket.remaining--;

		// callback(null, self.localBucket);
		// return q(self.localBucket);
	}

	self.redisClient.multi()
		.decr(self.keys.remaining)
		.mget(self.keys.remaining, self.keys.limit, self.keys.reset)
		.exec(function(err, res) {
			if (err) {
				error = new LimiterError('OL-E 003', self.id, err);
				callback(error);
				return deferred.reject(error);
			}

			// the reset key does not exist --> we don't have an active bucket
			// res[1] is the result-set from the mget command above
			if (!res[1][2]) {

				logDebug('{%s} - "reset" key does not exist --> creating new bucket', self.id);
				return deferred.resolve(self.createBucket(callback));
			}

			// no "remaining" left
			if (res[0] < 0) {
				logDebug('{%s} - Bucket limit {%d} reached, remaining calls in this period {%d}', self.id, res[1][1], 0);
				bucket = {
					remaining: -1,
					limit: res[1][1],
					reset: res[1][2]
				};

				callback(null, bucket);
				return deferred.resolve(bucket);
			}

			logDebug('{%s} - Bucket loaded from redis: remaining {%s}; limit {%s}, reset {%s}', self.id, res[0], res[1][1], new Date(parseInt(res[1][2], null)));
			bucket = {
				remaining: -1,
				limit: res[1][1],
				reset: res[1][2]
			};

			callback(null, bucket);
			return deferred.resolve(bucket);
		});

	return deferred.promise;
};

module.exports = OniyiLimiter;