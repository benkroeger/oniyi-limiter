#  [![NPM version][npm-image]][npm-url] 

> A limiter/throttling implementation in redis


## Install

```sh
$ npm install --save oniyi-limiter
```


## Usage

```js
var OniyiLimiter = require('oniyi-limiter');

var myLimiter = new OniyiLimiter({
	id: 'my-limiter',
	limit: 10,
	duration: 10000
});

myLimiter.getBucket(function(err, bucket){
	console.log(bucket);

	// {remaining: 9, limit: 10, reset: 1425969050096}
});

```

`getBucket` also returns a promise

```js

myLimiter.getBucket().then(function(bucket){
	console.log(bucket);

	// {remaining: 8, limit: 10, reset: 1425969050096}
}, function(reason){
	console.log('failed to get bucket from myLimiter');
	console.log(reason);
});

```



## Valid Options

```js

{
	id: 'my-limiter', // the limiter's id
	limit: 2500, // the number of calls that can be made per "duration", defaults to 2500
	duration: 60000, // the number of milliseconds a bucket is valid, defaults to 60000
	redisClient: redisClient, // an instance of a node redis client
	redis: {} // hash of options to create a redis client --> ignored if redisClient is provided
}

```

for valid options in `redis` see [make-redis-client](https://www.npmjs.com/package/make-redis-client)


## License

MIT © [Benjamin Kroeger]()


[npm-url]: https://npmjs.org/package/oniyi-limiter
[npm-image]: https://badge.fury.io/js/oniyi-limiter.svg
