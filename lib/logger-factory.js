'use strict';

// node core modules

// 3rd party modules
const oniyiLoggerFactory = require('oniyi-logger');

// internal modules

function loggerFactory(label = 'anonymous', settings = {}) {
  const logger = oniyiLoggerFactory(`oniyi:limiter:${label}`, settings);
  return logger;
}

module.exports = loggerFactory;
