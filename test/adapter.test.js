// Tests for the command adapter: prompt substitution and the child-process
// contract. No real model is used - every child is a tiny inline node script.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderCommand, runModel, parseCommand, DEFAULT_TIMEOUT_MS } = require('../src/adapter.js');

const NODE = process.execPath;

function nodeCommand(script) {
  return `"${NODE}" -e "${script.replace(/"/g, '\\"')}"`;
}

test('renderCommand substitutes the prompt as base64', () => {
  const command = renderCommand({ command: 'run {{prompt}}' }, 'hi');
  assert.equal(command, `run ${Buffer.from('hi', 'utf8').toString('base64')}`);
  assert.equal(command, 'run aGk=');
});

test('renderCommand accepts the explicit {{prompt_b64}} alias', () => {
  const command = renderCommand({ command: 'run {{prompt_b64}}' }, 'hi');
  assert.equal(command, 'run aGk=');
});

test('renderCommand substitutes the prompt verbatim in raw mode', () => {
  const command = renderCommand({ command: 'run {{prompt}}', encoding: 'raw' }, 'hello world');
  assert.equal(command, 'run hello world');
});

test('base64 substitution keeps quotes and newlines out of the command', () => {
  const prompt = 'say "hi"\nthen stop';
  const command = renderCommand({ command: 'run {{prompt}}' }, prompt);
  assert.ok(!command.includes('"'), 'the substituted prompt must not contain a quote');
  assert.ok(!command.includes('\n'), 'the substituted prompt must not contain a newline');
});

test('renderCommand leaves a template without a placeholder untouched', () => {
  assert.equal(renderCommand({ command: 'run --model x' }, 'hi'), 'run --model x');
});

test('parseCommand keeps quoted arguments and Windows paths intact', () => {
  const argv = parseCommand('"C:\\Program Files\\nodejs\\node.exe" -e "console.log(1)"');
  assert.deepEqual(argv, ['C:\\Program Files\\nodejs\\node.exe', '-e', 'console.log(1)']);
});

test('parseCommand returns an empty array for an empty template', () => {
  assert.deepEqual(parseCommand('   '), []);
});

test('parseCommand keeps an escaped quote inside a quoted argument', () => {
  assert.deepEqual(parseCommand('node -e "console.log(\\"hi\\")"'), ['node', '-e', 'console.log("hi")']);
});

test('runModel runs an inline script that contains double quotes', async () => {
  const run = await runModel({ command: nodeCommand('console.log("hi")') }, 'hi');
  assert.equal(run.output, 'hi');
  assert.equal(run.code, 0);
});

test('runModel returns the stdout of the command', async () => {
  const run = await runModel({ command: nodeCommand("console.log('hello')") }, 'hi');
  assert.equal(run.output, 'hello');
  assert.equal(run.code, 0);
  assert.equal(run.timedOut, false);
  assert.equal(run.stderr, '');
  assert.ok(run.durationMs >= 0);
});

test('runModel returns a non-zero exit code instead of throwing', async () => {
  const run = await runModel({ command: nodeCommand("process.exit(3)") }, 'hi');
  assert.equal(run.code, 3);
  assert.equal(run.timedOut, false);
});

test('runModel captures stderr separately from stdout', async () => {
  const run = await runModel({ command: nodeCommand("console.error('bad')") }, 'hi');
  assert.equal(run.output, '');
  assert.match(run.stderr, /bad/);
});

test('runModel reports a timeout rather than throwing', async () => {
  const run = await runModel(
    { command: nodeCommand('setTimeout(function(){}, 10000)'), timeoutMs: 300 },
    'hi',
  );
  assert.equal(run.timedOut, true);
  assert.equal(run.code, null);
});

test('runModel rejects when the command cannot be spawned', async () => {
  await assert.rejects(
    () => runModel({ command: 'definitely-not-a-real-command-xyz' }, 'hi'),
    (error) => {
      assert.match(error.message, /could not run/);
      assert.equal(error.spawnFailed, true);
      return true;
    },
  );
});

test('runModel rejects when no command is configured', async () => {
  await assert.rejects(
    () => runModel({ command: '  ' }, 'hi'),
    (error) => {
      assert.match(error.message, /no command configured/);
      return true;
    },
  );
});

test('runModel trims the output unless strip is false', async () => {
  const script = "console.log('x')";
  const trimmed = await runModel({ command: nodeCommand(script) }, 'hi');
  const kept = await runModel({ command: nodeCommand(script), strip: false }, 'hi');
  assert.equal(trimmed.output, 'x');
  assert.equal(kept.output, 'x\n');
});

test('runModel honours the timeout override in the options', async () => {
  const run = await runModel(
    { command: nodeCommand('setTimeout(function(){}, 10000)'), timeoutMs: 60000 },
    'hi',
    { timeoutMs: 300 },
  );
  assert.equal(run.timedOut, true);
});

test('DEFAULT_TIMEOUT_MS is 30000', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 30000);
});
