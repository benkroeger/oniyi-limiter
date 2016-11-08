// used to wrap errors related to creation of a new bucket.

'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

function CreateBucketError(err, limiterId) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, CreateBucketError);

  this.id = err.id;
  this.name = 'CreateBucketError';
  this.message = util.format('%s - %s', limiterId || 'anonymous limiter', err.message);
}

util.inherits(CreateBucketError, Error);

module.exports = CreateBucketError;
