// Tests for the metric functions: every scorer has to pass and fail
// correctly, and an unknown scorer has to be rejected by name.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SCORERS,
  getScorer,
  scoreOutput,
  scoreExact,
  scoreContains,
  scoreNotContains,
  scoreJson,
  scoreRegex,
  scoreLength,
} = require('../src/metrics.js');

test('SCORERS lists the six supported scorers', () => {
  assert.deepEqual(SCORERS, ['exact', 'contains', 'json', 'regex', 'not-contains', 'length']);
});

test('exact passes on a trimmed match', () => {
  const result = scoreExact('  Hello!  ', { expected: 'Hello!' });
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
  assert.match(result.detail, /exact|expected/);
});

test('exact fails on a different answer', () => {
  const result = scoreExact('Goodbye', { expected: 'Hello!' });
  assert.equal(result.pass, false);
  assert.equal(result.score, 0);
  assert.match(result.detail, /expected/);
});

test('contains passes when one of the expected phrases appears', () => {
  const result = scoreContains('the answer is seven', { expectedAny: ['7', 'seven'] });
  assert.equal(result.pass, true);
  assert.match(result.detail, /seven/);
});

test('contains accepts a single expected value', () => {
  const result = scoreContains('gravion rocks', { expected: 'gravion' });
  assert.equal(result.pass, true);
});

test('contains fails when nothing matches', () => {
  const result = scoreContains('nothing here', { expectedAny: ['gravion'] });
  assert.equal(result.pass, false);
  assert.match(result.detail, /missing/);
});

test('not-contains passes on clean output', () => {
  const result = scoreNotContains('ok', { forbidden: ['sorry', 'as an ai'] });
  assert.equal(result.pass, true);
  assert.match(result.detail, /clean/);
});

test('not-contains fails and names the forbidden phrase', () => {
  const result = scoreNotContains('sorry, as an ai I cannot', { forbidden: ['sorry', 'as an ai'] });
  assert.equal(result.pass, false);
  assert.match(result.detail, /sorry/);
});

test('json passes on a matching object', () => {
  const result = scoreJson('{"city":"Berlin"}', { expected: { city: 'Berlin' } });
  assert.equal(result.pass, true);
  assert.match(result.detail, /json ok/);
});

test('json finds an object inside prose', () => {
  const result = scoreJson('The city is Berlin. {"city":"Berlin"}', { expected: { city: 'Berlin' } });
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
});

test('json finds an array inside prose', () => {
  const result = scoreJson('Here you go: [1, 2, 3] thanks', { expected: [1, 2, 3] });
  assert.equal(result.pass, true);
});

test('json uses the first block when the answer holds more than one', () => {
  const result = scoreJson('first {"a":1} then {"b":2}', { expected: { a: 1 } });
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
});

test('json ignores braces that sit inside a string', () => {
  const result = scoreJson('{"note":"}"}', { expected: { note: '}' } });
  assert.equal(result.pass, true);
});

test('json fails on invalid json', () => {
  const result = scoreJson('not json at all', { expected: { city: 'Berlin' } });
  assert.equal(result.pass, false);
  assert.match(result.detail, /invalid json/);
});

test('json fails on a mismatch', () => {
  const result = scoreJson('{"city":"Paris"}', { expected: { city: 'Berlin' } });
  assert.equal(result.pass, false);
  assert.match(result.detail, /mismatch/);
});

test('regex passes on a matching answer', () => {
  const result = scoreRegex('2026-10-31', { pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
  assert.equal(result.pass, true);
  assert.match(result.detail, /matched/);
});

test('regex accepts a RegExp object', () => {
  const result = scoreRegex('answer: 42', { pattern: /\d+/ });
  assert.equal(result.pass, true);
});

test('regex fails when nothing matches', () => {
  const result = scoreRegex('31/10/2026', { pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
  assert.equal(result.pass, false);
  assert.match(result.detail, /no match/);
});

test('length passes within the limit and reports both numbers', () => {
  const result = scoreLength('apple', { maxChars: 10 });
  assert.equal(result.pass, true);
  assert.match(result.detail, /5/);
  assert.match(result.detail, /10/);
});

test('length fails above the limit', () => {
  const result = scoreLength('a very long answer indeed', { maxChars: 5 });
  assert.equal(result.pass, false);
  assert.ok(result.score < 1);
});

test('getScorer returns the scorer function by name', () => {
  assert.equal(getScorer('exact'), scoreExact);
  assert.equal(getScorer('contains'), scoreContains);
  assert.equal(getScorer('not-contains'), scoreNotContains);
  assert.equal(getScorer('json'), scoreJson);
  assert.equal(getScorer('regex'), scoreRegex);
  assert.equal(getScorer('length'), scoreLength);
});

test('an unknown scorer throws and names the scorer', () => {
  assert.throws(() => scoreOutput('x', { scorer: 'vibes' }), /vibes/);
});

test('scoreOutput clamps the score into the 0..1 range', () => {
  const result = scoreOutput('x', { scorer: 'exact', expected: 'x' });
  assert.equal(result.score, 1);
  assert.equal(result.pass, true);
});
