// This error indicates that there are no tokens left in the bucket

'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

function BucketEmptyError(bucket, limiterId) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, BucketEmptyError);

  this.name = 'BucketEmptyError';
  this.message = util.format('%s - All {%d} tokens from this bucket have been used. Retry after %s',
    limiterId || 'anonymous limiter',
    bucket.limit,
    new Date(parseInt(bucket.reset, 10))
  );
}

util.inherits(BucketEmptyError, Error);

module.exports = BucketEmptyError;
