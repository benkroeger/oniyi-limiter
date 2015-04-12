'use strict';
var util = require('util');

var OniyiLimiter = require('../');

function getAndLogBucket(limiter) {
	return function() {
		limiter.throttle().then(function(bucket) {
			console.log(bucket);
		}, function(reason){
			console.log(util.isError(reason));
			console.log(reason);
		});
	};
}

var globalLimiter = new OniyiLimiter({
	id: 'my-test-limiter',
	limit: 10,
	duration: 10000
});

globalLimiter.redisClient.on('ready', function() {
	for (var i = 0; i < globalLimiter.limit * 3; i++) {
		setTimeout(getAndLogBucket(globalLimiter), i * globalLimiter.duration / globalLimiter.limit / 2);
	}
});