// Tests for the JSON and Markdown renderers.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toJson, toMarkdown } = require('../src/report.js');

const run = {
  startedAt: '2026-10-31T12:00:00.000Z',
  finishedAt: '2026-10-31T12:00:07.000Z',
  durationMs: 7000,
  results: [
    {
      taskId: 'exact-greeting',
      name: 'Exact greeting',
      category: 'instruction-following',
      scorer: 'exact',
      passed: true,
      score: 1,
      detail: 'exact match',
      output: 'Hello!',
      durationMs: 120,
      timedOut: false,
      error: null,
    },
    {
      taskId: 'json-extraction',
      name: 'Structured JSON output',
      category: 'format',
      scorer: 'json',
      passed: false,
      score: 0,
      detail: 'invalid json',
      output: 'AKIAIOSFODNN7EXAMPLE',
      durationMs: 90,
      timedOut: false,
      error: null,
    },
  ],
  summary: {
    total: 2,
    passed: 1,
    failed: 1,
    errors: 0,
    passRate: 0.5,
    meanScore: 0.5,
    byCategory: { 'instruction-following': { total: 1, passed: 1, passRate: 1 } },
    byScorer: { exact: { total: 1, passed: 1, passRate: 1 } },
  },
};

test('toJson writes the root keys in a stable order', () => {
  const parsed = JSON.parse(toJson(run, { model: 'demo-model' }));
  assert.deepEqual(Object.keys(parsed), [
    'tool', 'schemaVersion', 'model', 'startedAt', 'finishedAt', 'durationMs', 'summary', 'results',
  ]);
  assert.equal(parsed.tool, 'local-slm-eval-kit');
  assert.equal(parsed.model, 'demo-model');
});

test('toJson writes each result key in a stable order', () => {
  const parsed = JSON.parse(toJson(run, { model: 'demo-model' }));
  assert.deepEqual(Object.keys(parsed.results[0]), [
    'taskId', 'name', 'category', 'scorer', 'passed', 'score', 'detail', 'output',
    'durationMs', 'timedOut', 'error',
  ]);
});

test('toJson indents with two spaces', () => {
  const text = toJson(run, { model: 'demo-model' });
  assert.ok(text.includes('\n  "tool"'), text.slice(0, 60));
});

test('toJson redacts the model output', () => {
  const parsed = JSON.parse(toJson(run, { model: 'demo-model' }));
  assert.equal(parsed.results[1].output, 'AKIA…MPLE');
});

test('toMarkdown carries the title, the model and every required section', () => {
  const text = toMarkdown(run, { model: 'demo-model' });
  assert.ok(text.includes('# Local SLM Evaluation Report'), text);
  assert.ok(text.includes('- Model: `demo-model`'), text);
  assert.ok(text.includes('## Summary'), text);
  assert.ok(text.includes('## Results'), text);
  assert.ok(text.includes('## Category breakdown'), text);
  assert.ok(text.includes('## Scorer breakdown'), text);
});

test('toMarkdown uses the exact table headers', () => {
  const text = toMarkdown(run, { model: 'demo-model' });
  assert.ok(text.includes('| Task | Category | Scorer | Passed | Score | Detail |'), text);
  assert.ok(text.includes('| Category | Total | Passed | Pass rate |'), text);
  assert.ok(text.includes('| Scorer | Total | Passed | Pass rate |'), text);
});

test('toMarkdown reports the summary numbers', () => {
  const text = toMarkdown(run, { model: 'demo-model' });
  assert.ok(text.includes('Pass rate: 0.5'), text);
  assert.ok(text.includes('Mean score: 0.5'), text);
  assert.ok(text.includes('Total: 2'), text);
});

test('toMarkdown says so when there is nothing to report', () => {
  const empty = { results: [], summary: {} };
  const text = toMarkdown(empty, { model: 'demo-model' });
  assert.ok(text.includes('No results.'), text);
});

test('toMarkdown redacts the model output', () => {
  const text = toMarkdown(run, { model: 'demo-model' });
  assert.ok(!text.includes('AKIAIOSFODNN7EXAMPLE'), text);
  assert.ok(text.includes('AKIA…MPLE'), text);
});
