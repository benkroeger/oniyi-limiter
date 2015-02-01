/*global describe, it */
'use strict';
var assert = require('assert');
var OniyiLimiter = require('../');

var globalLimiter;

function getAndLogBucket(limiter) {
	return function() {
		limiter.getBucket().then(function(bucket) {
			console.log(bucket);
		});
	};
}


describe('oniyi-limiter node module', function() {
	it('must create an instance with only a string provided', function() {
		var id = 'unit-test-1';
		var limiter = new OniyiLimiter(id);

		assert.equal(limiter.id, id, 'The id should have been picked up');
	});
	it('must create an instance with detailed config', function() {
		var id = 'unit-test-2';
		globalLimiter = new OniyiLimiter({
			id: id,
			limit: 10,
			duration: 1000
		});

		globalLimiter.redisClient.on('connect', function() {
			for (var i = 0; i < globalLimiter.limit; i++) {
				setTimeout(getAndLogBucket(globalLimiter), i * globalLimiter.duration / globalLimiter.limit);
			}
		});

		setTimeout(function() {
			// validate creation of instance
			assert.equal(globalLimiter.id, id, 'The id should have been picked up');
		}, 2000);
	});
});