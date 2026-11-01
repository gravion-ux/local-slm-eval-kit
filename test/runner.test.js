// Tests for the suite runner: ordering, failure handling and the summary.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runSuite } = require('../src/runner.js');
const { TASKS } = require('../src/tasks.js');

function fakeRun(output, extra = {}) {
  return async () => ({
    output,
    stdout: output,
    stderr: '',
    code: 0,
    timedOut: false,
    durationMs: 1,
    ...extra,
  });
}

const twoTasks = [
  { id: 'first', name: 'First', category: 'c1', scorer: 'exact', prompt: 'p1', expected: 'ok' },
  { id: 'second', name: 'Second', category: 'c2', scorer: 'exact', prompt: 'p2', expected: 'ok' },
];

test('results keep the order of the task list', async () => {
  const result = await runSuite(twoTasks, { command: 'x' }, { runModel: fakeRun('ok') });
  assert.deepEqual(result.results.map((item) => item.taskId), ['first', 'second']);
});

test('a failing task does not stop the suite', async () => {
  const result = await runSuite(twoTasks, { command: 'x' }, { runModel: fakeRun('wrong') });
  assert.equal(result.results.length, 2);
  assert.equal(result.summary.failed, 2);
  assert.equal(result.summary.passed, 0);
});

test('a timeout is recorded as a failure with an error', async () => {
  const result = await runSuite(twoTasks, { command: 'x', timeoutMs: 250 }, {
    runModel: fakeRun('', { timedOut: true, code: null }),
  });
  assert.equal(result.results[0].passed, false);
  assert.equal(result.results[0].score, 0);
  assert.equal(result.results[0].timedOut, true);
  assert.match(result.results[0].error, /timed out/);
});

test('a timeout reports the timeout that was really in force', async () => {
  const result = await runSuite(twoTasks, { command: 'x' }, {
    runModel: fakeRun('', { timedOut: true, code: null }),
  });
  assert.match(result.results[0].error, /timed out after 30000ms/);
});

test('a timeout reports the adapter timeout when the run does not override it', async () => {
  const result = await runSuite(twoTasks, { command: 'x', timeoutMs: 250 }, {
    runModel: fakeRun('', { timedOut: true, code: null }),
  });
  assert.match(result.results[0].error, /timed out after 250ms/);
});

test('an adapter error is recorded and the suite continues', async () => {
  let calls = 0;
  const result = await runSuite(twoTasks, { command: 'x' }, {
    runModel: async () => {
      calls += 1;
      if (calls === 1) throw new Error('spawn refused');
      return { output: 'ok', stdout: 'ok', stderr: '', code: 0, timedOut: false, durationMs: 1 };
    },
  });
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].passed, false);
  assert.match(result.results[0].error, /spawn refused/);
  assert.equal(result.results[1].passed, true);
  assert.equal(result.summary.errors, 1);
});

test('onError is called when the adapter throws', async () => {
  const seen = [];
  await runSuite(twoTasks, { command: 'x' }, {
    runModel: async () => { throw new Error('boom'); },
    onError: (error) => seen.push(error.message),
  });
  assert.equal(seen.length, 2);
  assert.equal(seen[0], 'boom');
});

test('the summary counts match the results', async () => {
  const result = await runSuite(twoTasks, { command: 'x' }, { runModel: fakeRun('ok') });
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.passed, 2);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.passRate, 1);
  assert.equal(result.summary.meanScore, 1);
});

test('the pass rate and the mean score are rounded to four decimals', async () => {
  const result = await runSuite(twoTasks, { command: 'x' }, {
    runModel: async (_config, prompt) => ({
      output: prompt === 'p1' ? 'ok' : 'wrong',
      stdout: '', stderr: '', code: 0, timedOut: false, durationMs: 1,
    }),
  });
  assert.equal(result.summary.passRate, 0.5);
  assert.equal(result.summary.meanScore, 0.5);
});

test('the breakdown groups by category and by scorer', async () => {
  const result = await runSuite(twoTasks, { command: 'x' }, { runModel: fakeRun('ok') });
  assert.equal(result.summary.byCategory.c1.total, 1);
  assert.equal(result.summary.byCategory.c1.passed, 1);
  assert.equal(result.summary.byScorer.exact.total, 2);
  assert.equal(result.summary.byScorer.exact.passRate, 1);
});

test('onResult is called once per task', async () => {
  const seen = [];
  await runSuite(twoTasks, { command: 'x' }, {
    runModel: fakeRun('ok'),
    onResult: (item) => seen.push(item.taskId),
  });
  assert.deepEqual(seen, ['first', 'second']);
});

test('options.tasks narrows the suite', async () => {
  const result = await runSuite(twoTasks, { command: 'x' }, {
    runModel: fakeRun('ok'),
    tasks: ['second'],
  });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].taskId, 'second');
});

test('an empty suite reports a pass rate of zero', async () => {
  const result = await runSuite([], { command: 'x' }, { runModel: fakeRun('ok') });
  assert.equal(result.summary.total, 0);
  assert.equal(result.summary.passRate, 0);
  assert.equal(result.summary.meanScore, 0);
});

test('the run timeout is passed down to the adapter', async () => {
  let seen = null;
  await runSuite(twoTasks, { command: 'x' }, {
    timeoutMs: 1234,
    runModel: async (_config, _prompt, options) => {
      seen = options.timeoutMs;
      return { output: 'ok', stdout: '', stderr: '', code: 0, timedOut: false, durationMs: 1 };
    },
  });
  assert.equal(seen, 1234);
});

test('the built-in suite runs end to end against a fake model', async () => {
  const result = await runSuite(TASKS, { command: 'x' }, { runModel: fakeRun('ok') });
  assert.equal(result.results.length, TASKS.length);
  assert.ok(result.summary.total > 0);
});
