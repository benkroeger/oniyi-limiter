// Used to wrap any error caused by a failed validation check on loaded buckets

'use strict';
var util = require('util');

function InvalidBucketError (err, limiterId) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, InvalidBucketError);

  this.id = err.id;
  this.name = 'InvalidBucketError';
  this.message = util.format('%s - %s', limiterId || 'anonymous limiter', err.message);
}

util.inherits(InvalidBucketError, Error);

module.exports = InvalidBucketError;
