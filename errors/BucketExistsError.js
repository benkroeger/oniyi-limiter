// used to wrap errors when trying to create a bucket that exists already.

'use strict';
var util = require('util');

function BucketExistsError (err, limiterId) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, BucketExistsError);

  this.id = err.id;
  this.name = 'BucketExistsError';
  this.message = util.format('%s - %s', limiterId || 'anonymous limiter', err.message);
}

util.inherits(BucketExistsError, Error);

module.exports = BucketExistsError;
