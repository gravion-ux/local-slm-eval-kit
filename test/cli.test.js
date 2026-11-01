// Tests for the CLI: argument parsing, exit codes and the report files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseArgs, runCli } = require('../src/cli.js');

const NODE = process.execPath;

function nodeCommand(script) {
  return `"${NODE}" -e "${script.replace(/"/g, '\\"')}"`;
}

function capture() {
  const out = [];
  const err = [];
  return {
    out,
    err,
    text: () => out.join(''),
    errorText: () => err.join(''),
    io: {
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
    },
  };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slm-eval-cli-'));
}

test('parseArgs reads the run options', () => {
  const options = parseArgs([
    'run', '--command', 'llama-cli -m x', '--task', 'exact-greeting',
    '--model', 'tiny', '--timeout', '5000', '--json', 'out.json', '--md', 'out.md', '--quiet',
  ]);
  assert.equal(options.action, 'run');
  assert.equal(options.command, 'llama-cli -m x');
  assert.equal(options.task, 'exact-greeting');
  assert.equal(options.model, 'tiny');
  assert.equal(options.timeout, 5000);
  assert.equal(options.json, 'out.json');
  assert.equal(options.md, 'out.md');
  assert.equal(options.quiet, true);
});

test('parseArgs accepts the --flag=value form', () => {
  const options = parseArgs(['run', '--command=llama-cli -m x', '--model=tiny']);
  assert.equal(options.command, 'llama-cli -m x');
  assert.equal(options.model, 'tiny');
});

test('parseArgs reads a bare --json as the json-only flag', () => {
  const options = parseArgs(['tasks', '--json']);
  assert.equal(options.jsonOnly, true);
  assert.equal(options.json, null);
});

test('parseArgs reports a flag that is missing its value', () => {
  const options = parseArgs(['run', '--command']);
  assert.equal(options.missingValue, '--command');
});

test('run without a command is a usage error', async () => {
  const io = capture();
  const code = await runCli(['run'], io.io);
  assert.equal(code, 2);
  assert.match(io.errorText(), /slm-eval: error: --command is required/);
});

test('no action at all is a usage error', async () => {
  const io = capture();
  const code = await runCli([], io.io);
  assert.equal(code, 2);
  assert.match(io.errorText(), /slm-eval: error:/);
});

test('an unknown action is a usage error', async () => {
  const io = capture();
  const code = await runCli(['frobnicate'], io.io);
  assert.equal(code, 2);
  assert.match(io.errorText(), /unknown command/);
});

test('tasks prints the built-in catalogue', async () => {
  const io = capture();
  const code = await runCli(['tasks'], io.io);
  assert.equal(code, 0);
  assert.match(io.text(), /exact-greeting/);
  assert.match(io.text(), /json-extraction/);
});

test('tasks --json prints the catalogue as JSON', async () => {
  const io = capture();
  const code = await runCli(['tasks', '--json'], io.io);
  assert.equal(code, 0);
  const parsed = JSON.parse(io.text());
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.length >= 10);
});

test('scorers prints the scorer catalogue', async () => {
  const io = capture();
  const code = await runCli(['scorers'], io.io);
  assert.equal(code, 0);
  assert.match(io.text(), /not-contains/);
});

test('scorers --json prints the scorers as JSON', async () => {
  const io = capture();
  const code = await runCli(['scorers', '--json'], io.io);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(io.text()), ['exact', 'contains', 'json', 'regex', 'not-contains', 'length']);
});

test('a run where every selected task passes exits with 0', async () => {
  const io = capture();
  const code = await runCli(
    ['run', '--command', nodeCommand("console.log('Hello!')"), '--task', 'exact-greeting'],
    io.io,
  );
  assert.equal(code, 0);
  assert.match(io.text(), /task\(s\)/);
  assert.match(io.text(), /exact-greeting/);
});

test('a run with a failing task exits with 1', async () => {
  const io = capture();
  const code = await runCli(
    ['run', '--command', nodeCommand("console.log('Hello!')"), '--task', 'json-extraction'],
    io.io,
  );
  assert.equal(code, 1);
  assert.match(io.text(), /json-extraction/);
});

test('a command that cannot be spawned exits with 3', async () => {
  const io = capture();
  const code = await runCli(
    ['run', '--command', 'definitely-not-a-real-command-xyz', '--task', 'exact-greeting'],
    io.io,
  );
  assert.equal(code, 3);
  assert.match(io.errorText(), /slm-eval: error:/);
});

test('an unknown task id is a usage error', async () => {
  const io = capture();
  const code = await runCli(
    ['run', '--command', nodeCommand("console.log('x')"), '--task', 'not-a-task'],
    io.io,
  );
  assert.equal(code, 2);
  assert.match(io.errorText(), /unknown task/);
});

test('--quiet suppresses the human summary', async () => {
  const io = capture();
  await runCli(
    ['run', '--command', nodeCommand("console.log('Hello!')"), '--task', 'exact-greeting', '--quiet'],
    io.io,
  );
  assert.ok(!io.text().includes('task(s)'), io.text());
});

test('the JSON and Markdown reports are written to disk', async () => {
  const dir = tempDir();
  const jsonPath = path.join(dir, 'report.json');
  const mdPath = path.join(dir, 'report.md');
  const io = capture();
  const code = await runCli([
    'run',
    '--command', nodeCommand("console.log('Hello!')"),
    '--task', 'exact-greeting',
    '--model', 'fake-model',
    '--json', jsonPath,
    '--md', mdPath,
  ], io.io);
  assert.equal(code, 0);
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(parsed.tool, 'local-slm-eval-kit');
  assert.equal(parsed.model, 'fake-model');
  assert.equal(parsed.summary.total, 1);
  const markdown = fs.readFileSync(mdPath, 'utf8');
  assert.match(markdown, /# Local SLM Evaluation Report/);
  assert.match(markdown, /- Model: `fake-model`/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the JSON report redacts the model output', async () => {
  const dir = tempDir();
  const jsonPath = path.join(dir, 'report.json');
  const io = capture();
  await runCli([
    'run',
    '--command', nodeCommand("console.log('AKIAIOSFODNN7EXAMPLE')"),
    '--task', 'exact-greeting',
    '--json', jsonPath,
  ], io.io);
  const text = fs.readFileSync(jsonPath, 'utf8');
  assert.ok(!text.includes('AKIAIOSFODNN7EXAMPLE'), text);
  assert.ok(text.includes('AKIA…MPLE'), text);
  fs.rmSync(dir, { recursive: true, force: true });
});
