// This error indicates that there are no tokens left in the bucket

'use strict';
var util = require('util');

function BucketEmptyError (bucket, limiterId) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, BucketEmptyError);

  this.name = 'BucketEmptyError';
  this.message = util.format('%s - All {%d} tokens from this bucket have been used. Retry after %s', limiterId || 'anonymous limiter', bucket.limit, new Date(parseInt(bucket.reset, null)));
}

util.inherits(BucketEmptyError, Error);

module.exports = BucketEmptyError;
