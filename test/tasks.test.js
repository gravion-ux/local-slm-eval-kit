// Tests for the built-in task suite and the task-file loader.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { TASKS, getTask, loadTasks } = require('../src/tasks.js');

const REQUIRED_BY_SCORER = {
  exact: ['expected'],
  contains: ['expectedAny', 'expected'],
  json: ['expected'],
  regex: ['pattern'],
  'not-contains': ['forbidden'],
  length: ['maxChars'],
};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slm-eval-tasks-'));
}

test('the built-in suite has at least ten tasks', () => {
  assert.ok(TASKS.length >= 10, `expected at least 10 tasks, got ${TASKS.length}`);
});

test('every built-in task has an id, a prompt, a category and a known scorer', () => {
  const known = new Set(['exact', 'contains', 'json', 'regex', 'not-contains', 'length']);
  for (const task of TASKS) {
    assert.ok(task.id, 'task needs an id');
    assert.ok(task.prompt && task.prompt.length > 0, `${task.id} needs a prompt`);
    assert.ok(task.category, `${task.id} needs a category`);
    assert.ok(known.has(task.scorer), `${task.id} has an unknown scorer ${task.scorer}`);
    assert.ok(task.description, `${task.id} needs a description`);
  }
});

test('every built-in task carries the fields its scorer needs', () => {
  for (const task of TASKS) {
    const fields = REQUIRED_BY_SCORER[task.scorer];
    const has = fields.some((field) => {
      const value = task[field];
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    });
    assert.ok(has, `${task.id} is missing the input field for scorer ${task.scorer}`);
  }
});

test('the built-in suite covers every required task id', () => {
  const required = [
    'exact-greeting',
    'contains-keyword',
    'not-contains-forbidden',
    'json-extraction',
    'json-with-prose',
    'regex-date',
    'length-limit',
    'refusal-refused',
    'list-count',
    'no-hallucination',
  ];
  for (const id of required) {
    assert.ok(getTask(id), `missing built-in task ${id}`);
  }
});

test('getTask returns undefined for an unknown id', () => {
  assert.equal(getTask('does-not-exist'), undefined);
});

test('loadTasks reads an array of tasks', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, JSON.stringify([
    { id: 'a', prompt: 'p', scorer: 'exact', expected: 'x' },
  ]), 'utf8');
  const tasks = loadTasks(file);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'a');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadTasks reads an object with a tasks array', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, JSON.stringify({
    tasks: [{ id: 'b', prompt: 'p', scorer: 'contains', expectedAny: ['y'] }],
  }), 'utf8');
  const tasks = loadTasks(file);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'b');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadTasks rejects an unknown scorer and names the task', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, JSON.stringify([
    { id: 'broken-task', prompt: 'p', scorer: 'vibes' },
  ]), 'utf8');
  assert.throws(() => loadTasks(file), /broken-task/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadTasks rejects a task without an id and names the position', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, JSON.stringify([
    { prompt: 'p', scorer: 'exact', expected: 'x' },
  ]), 'utf8');
  assert.throws(() => loadTasks(file), /task-1/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadTasks rejects a task without a prompt', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, JSON.stringify([
    { id: 'no-prompt', scorer: 'exact', expected: 'x' },
  ]), 'utf8');
  assert.throws(() => loadTasks(file), /no-prompt/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadTasks rejects a task whose scorer has no input', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, JSON.stringify([
    { id: 'no-input', prompt: 'p', scorer: 'regex' },
  ]), 'utf8');
  assert.throws(() => loadTasks(file), /no-input/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadTasks rejects a file that is not valid JSON', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, '{ not json', 'utf8');
  assert.throws(() => loadTasks(file), /not valid JSON/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadTasks rejects a file that holds neither an array nor a tasks array', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  fs.writeFileSync(file, JSON.stringify({ items: [] }), 'utf8');
  assert.throws(() => loadTasks(file), /tasks/);
  fs.rmSync(dir, { recursive: true, force: true });
});
