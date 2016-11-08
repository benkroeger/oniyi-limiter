'use strict';

// node core modules

// 3rd party modules

// internal modules

module.exports = [
  'LimiterError',
  'CreateBucketError',
  'BucketExistsError',
  'InvalidBucketError',
  'BucketEmptyError',
].reduce((result, name) =>
  Object.assign(result, {
    [name]: require(`./${name}`), // eslint-disable-line global-require
  }), {});
