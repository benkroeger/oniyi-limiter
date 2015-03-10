/*global describe, it */
'use strict';
var OniyiLimiter = require('../');

function getAndLogBucket(limiter) {
	return function() {
		limiter.getBucket().then(function(bucket) {
			console.log(bucket);
		});
	};
}

var globalLimiter = new OniyiLimiter({
	id: 'my-test-limiter',
	limit: 10,
	duration: 10000
});

globalLimiter.redisClient.on('ready', function() {
	for (var i = 0; i < globalLimiter.limit; i++) {
		setTimeout(getAndLogBucket(globalLimiter), i * globalLimiter.duration / globalLimiter.limit);
	}
});