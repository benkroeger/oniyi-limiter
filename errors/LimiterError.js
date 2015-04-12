// This error is used to wrap general errors occuring in Oniyi-Limiter.

'use strict';
var util = require('util');

function LimiterError (err, limiterId) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, LimiterError);

  this.id = err.id;
  this.name = 'LimiterError';
  this.message = util.format('%s - %s', limiterId || 'anonymous limiter', err.message);
}

util.inherits(LimiterError, Error);

module.exports = LimiterError;
