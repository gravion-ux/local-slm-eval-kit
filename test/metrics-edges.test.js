'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreOutput } = require('../src/metrics.js');

test('not-contains ignores empty forbidden phrases', () => {
  const result = scoreOutput('anything', { scorer: 'not-contains', forbidden: [''] });
  assert.equal(result.pass, true);
});
