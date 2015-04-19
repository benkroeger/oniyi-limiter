[![NPM info](https://nodei.co/npm/oniyi-limiter.png?downloads=true)](https://nodei.co/npm/oniyi-limiter.png?downloads=true)

[![dependencies](https://david-dm.org/benkroeger/oniyi-limiter.png)](https://david-dm.org/benkroeger/oniyi-limiter.png)

> A limiter/throttling implementation in redis


## Install

```sh
$ npm install --save oniyi-limiter
```


## Getting Started
Construct a new instance of OniyiLimiter as shown in the following example and call the `throttle` method whenever you want to execute a call against the represented resource.

```js
var OniyiLimiter = require('oniyi-limiter');

var myLimiter = new OniyiLimiter('my-limiter');

myLimiter.throttle(function(err, bucket){
	if (err) {
		// you should not execute any code because there was either a system error or no tokens left in the bucket
		return;
	}
	console.log('This call was throttled. My bucket now looks like this: %j', bucket);
	// {remaining: 9, limit: 10, reset: 1425969050096}
});
```

## Methods

### new OniyiLimiter(options)
This is the constructor to instantiate a new limiter.
The first argument can be either a `id` or an `options` object. The only required option is `id`; all others are optional.

* `id` - a unique String identifying the resource you want to limit access to. This string is also used to construct the redis key under which our bucket hash is stored.
* `limit` - the number of tokens available in a bucket per `duration` (defaults to `2500`). If `OniyiLimiter.throttle` is called more often than this number during the validity of one slingle bucket, a `BucketEmptyError` will be passed to the callback function.
* `duration` - the number of milliseconds a bucket is valid (defaults to `60000`)
* `useLocalFallback` - a true / false switch to indicate weather `OniyiLimiter` should use a local (in-memory) fallback for managing the bucket in case the redis client is not connected (defaults to `false`).
* `redisClient` - an instance of the node [redis](https://www.npmjs.com/package/redis) client
* `redis` - an object of options that can be passed to [make-redis-client](https://www.npmjs.com/package/make-redis-client) in order to create a redis client (defautls to `{}` and thus tries to connect to `localhost` on port `6379`).

### createBucket(callback)
This method is used to create a new bucket for it's `OniyiLimiter` instance. That means, it will create a new bucket with the configured `limit` as size and `Date.now()` + `duration` as expiry date in redis.
However, if there is an existing bucket in redis for this instance already, it will not be overwritten and an error will be passed to callback instead.

This method does not automatically execute a `throttle` command. It simply creates a new bucket if possible and passes it to the callback function.

```js
myLimiter.createBucket(function(err, bucket){
	if (err) {
		console.log(err);
		// { [BucketExistsError: my-limiter - A bucket exists already]
  	// name: 'BucketExistsError',
  	// message: 'my-limiter - A bucket exists already' }
  	return;
	}
	console.log(bucket);
	// {remaining: 10, limit: 10, reset: 1425969050096}
});
```

`createBucket` returns a `q` promise that resolves with the created bucket or rejects with a proper reason accordingly.

```js
var promise = myLimiter.createBucket();

promise.then(function(bucket){
	console.log(bucket);
	// {remaining: 10, limit: 10, reset: 1425969050096}
}, function(reason){
	console.log(reason);
	// { [BucketExistsError: my-limiter - A bucket exists already]
  // name: 'BucketExistsError',
  // message: 'my-limiter - A bucket exists already' }
});
```

**Note:** It is not recommended to use this method directly. Please only use `throttle` instead. It will check for bucket availability and create new buckets if required. 

### throttle(callback)
This method will check for an available token in the current bucket of it's instance of `OniyiLimiter`. If no bucket exists, it will create one and then execute the callback. If a bucket exists and is not empty, `throttle` will reduce the `remaining` number of tokens by one and call the callback function.
If any error occurs or there are no tokens left in the active bucket, an error will be passed to the callback function.

```js
myLimiter.throttle(function(err, bucket){
	if (err) {
		console.log(err);
		// { [BucketEmptyError: my-limiter - All {10} tokens from this bucket have been used. Retry after Sat Apr 11 2015 22:13:35 GMT+0900 (KST)]
  	// name: 'BucketEmptyError',
  	// message: 'my-limiter - All {10} tokens from this bucket have been used. Retry after Sat Apr 11 2015 22:13:35 GMT+0900 (KST)' }
  	return;
	}
	console.log(bucket);
	// {remaining: 9, limit: 10, reset: 1425969050096}
});
```

**Note:** if the callback function receives an error, it should not execute the code that was supposed to be throttled.

`throttle` also returns a promise that either resolves with the bucket or is rejected with an according error.

```js
var promise = myLimiter.throttle();

promise.then(function(bucket){
	console.log(bucket);
	// {remaining: 9, limit: 10, reset: 1425969050096}
}, function(reason){
	console.log(reason);
	// { [BucketEmptyError: my-limiter - All {10} tokens from this bucket have been used. Retry after Sat Apr 11 2015 22:13:35 GMT+0900 (KST)]
	// name: 'BucketEmptyError',
	// message: 'my-limiter - All {10} tokens from this bucket have been used. Retry after Sat Apr 11 2015 22:13:35 GMT+0900 (KST)' }
	return;
});
```

### DEPRECATED: getBucket
This method is deprecated as of version 0.0.9. Please use `throttle` instead.

## Debugging
Set the environment variable `DEBUG` to a value that contains `oniyi-limiter` and it'll start talking to you.

## Future plans
In order to support API transactions, it should be possible to request multiple tokens at once. This will allow to secure enough resources to complete a whole transaction... or postpone it to the next bucket if the number of available tokens isn't sufficient to complete the transaction.

## License

MIT © [Benjamin Kroeger]()


[npm-url]: https://npmjs.org/package/oniyi-limiter
[npm-image]: https://badge.fury.io/js/oniyi-limiter.svg
