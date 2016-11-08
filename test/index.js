'use strict';

import test from 'ava';
import _ from 'lodash';
import oniyiLimiterFactory from '../lib';

test('factory returns object', (t) => {
  const limiter = oniyiLimiterFactory();
  t.truthy(_.isPlainObject(limiter), 'limiter instance is not a plain object');
});
