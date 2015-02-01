var messages = require('./messages.json');

function LimiterError (code, limiterId, error) {
	// @TODO: might be slow, need to investigate
	if (typeof error === 'string') {
		error = new Error(error);
	}
  Error.call(this, error.message);
  this.name = "LimiterError";
  this.message = messages[code] || 'Unknown Error Message for code { ' + code + ' }';
  this.code = code;
  this.status = 500;
  this.inner = error;
}

LimiterError.prototype = Object.create(Error.prototype);
LimiterError.prototype.constructor = LimiterError;

module.exports = LimiterError;
