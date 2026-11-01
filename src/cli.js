#!/usr/bin/env node
// CLI entry point for the Local SLM Evaluation Kit.

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const { TASKS, getTask, loadTasks } = require('./tasks.js');
const { SCORERS } = require('./metrics.js');
const { runSuite } = require('./runner.js');
const { toJson, toMarkdown } = require('./report.js');

const USAGE = [
  'slm-eval - repeatable evaluation for a local small language model',
  '',
  'Usage:',
  '  slm-eval run --command "<template>" [--task <id>] [--tasks <file.json>]',
  '          [--model <name>] [--timeout <ms>] [--json <out.json>] [--md <out.md>] [--quiet]',
  '  slm-eval tasks [--json]',
  '  slm-eval scorers [--json]',
  '',
  'The command template must contain {{prompt}} or {{prompt_b64}}; the prompt is',
  'substituted as base64 unless the adapter is configured with encoding "raw".',
].join('\n');

const FLAGS_WITH_VALUE = new Set(['--command', '--task', '--tasks', '--model', '--timeout', '--json', '--md']);

/**
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const options = {
    action: null,
    command: null,
    task: null,
    tasksFile: null,
    model: null,
    timeout: null,
    json: null,
    jsonOnly: false,
    md: null,
    quiet: false,
    help: false,
  };

  let index = 0;
  if (args[0] && !args[0].startsWith('-')) {
    options.action = args[0];
    index = 1;
  }

  for (; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (arg === '--json' && (!args[index + 1] || args[index + 1].startsWith('-'))) {
      options.jsonOnly = true;
      continue;
    }

    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inlineValue = eq === -1 ? null : arg.slice(eq + 1);
    if (!FLAGS_WITH_VALUE.has(name)) continue;

    const value = inlineValue !== null ? inlineValue : args[++index];
    if (value === undefined) {
      options.missingValue = name;
      return options;
    }

    switch (name) {
      case '--command': options.command = value; break;
      case '--task': options.task = value; break;
      case '--tasks': options.tasksFile = value; break;
      case '--model': options.model = value; break;
      case '--timeout': options.timeout = Number(value); break;
      case '--json': options.json = value; break;
      case '--md': options.md = value; break;
      default: break;
    }
  }

  return options;
}

function resolveWriter(io, name) {
  const candidate = io ? io[name] : null;
  if (typeof candidate === 'function') return candidate;
  if (candidate && typeof candidate.write === 'function') {
    return (text) => candidate.write(text);
  }
  return (text) => process[name].write(text);
}

function taskCatalogueText() {
  const lines = ['Built-in tasks:', ''];
  for (const task of TASKS) {
    lines.push(`${task.id} [${task.category}/${task.scorer}] - ${task.description}`);
  }
  lines.push('');
  lines.push(`${TASKS.length} task(s).`);
  return lines.join('\n');
}

function scorerCatalogueText() {
  const lines = ['Scorers:', ''];
  for (const scorer of SCORERS) {
    lines.push(`${scorer}`);
  }
  lines.push('');
  lines.push(`${SCORERS.length} scorer(s).`);
  return lines.join('\n');
}

function writeOut(target, text) {
  const dir = path.dirname(path.resolve(target));
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, text, 'utf8');
}

/**
 * @param {string[]} argv
 * @param {{stdout?: Function, stderr?: Function}} [io]
 * @returns {Promise<number>} process exit code
 */
async function runCli(argv, io = {}) {
  const stdout = resolveWriter(io, 'stdout');
  const stderr = resolveWriter(io, 'stderr');
  const options = parseArgs(argv);

  if (options.missingValue) {
    stderr(`slm-eval: error: ${options.missingValue} needs a value`);
    return 2;
  }

  if (options.help) {
    stdout(`${USAGE}\n`);
    return 0;
  }

  if (!options.action) {
    stderr(`slm-eval: error: no command given\n${USAGE}`);
    return 2;
  }

  try {
    if (options.action === 'tasks') {
      const payload = JSON.stringify(TASKS, null, 2);
      if (typeof options.json === 'string') {
        writeOut(options.json, payload);
        stdout(taskCatalogueText());
      } else if (options.jsonOnly) {
        stdout(payload);
      } else {
        stdout(taskCatalogueText());
      }
      return 0;
    }

    if (options.action === 'scorers') {
      const payload = JSON.stringify(SCORERS, null, 2);
      if (typeof options.json === 'string') {
        writeOut(options.json, payload);
        stdout(scorerCatalogueText());
      } else if (options.jsonOnly) {
        stdout(payload);
      } else {
        stdout(scorerCatalogueText());
      }
      return 0;
    }

    if (options.action !== 'run') {
      stderr(`slm-eval: error: unknown command "${options.action}"\n${USAGE}`);
      return 2;
    }

    if (!options.command || !String(options.command).trim()) {
      stderr('slm-eval: error: --command is required for "run"');
      return 2;
    }

    let tasks = TASKS;
    if (options.tasksFile) {
      tasks = loadTasks(options.tasksFile);
    }
    if (options.task) {
      const selected = tasks.filter((task) => task.id === options.task);
      if (!selected.length) {
        stderr(`slm-eval: error: unknown task "${options.task}"`);
        return 2;
      }
      tasks = selected;
    }

    let spawnFailed = false;
    const adapterConfig = {
      command: options.command,
      timeoutMs: Number.isFinite(options.timeout) ? options.timeout : undefined,
    };

    const result = await runSuite(tasks, adapterConfig, {
      timeoutMs: adapterConfig.timeoutMs,
      onError: (error) => {
        if (error && error.spawnFailed) spawnFailed = true;
      },
      onResult: options.quiet
        ? null
        : (item) => {
          const state = item.passed ? 'pass' : 'fail';
          stdout(`  ${item.taskId}: ${state} (score ${item.score})\n`);
        },
    });

    const summary = result.summary;
    if (!options.quiet) {
      stdout(`slm-eval: ${summary.total} task(s), ${summary.passed} passed, ${summary.failed} failed (pass rate ${summary.passRate})\n`);
    }

    const meta = { model: options.model || 'unknown' };
    const jsonText = toJson(result, meta);
    const markdownText = toMarkdown(result, meta);

    if (typeof options.json === 'string') writeOut(options.json, jsonText);
    else if (options.jsonOnly) stdout(jsonText);

    if (typeof options.md === 'string') writeOut(options.md, markdownText);

    if (spawnFailed) {
      stderr('slm-eval: error: the model command could not be run');
      return 3;
    }
    return summary.failed > 0 ? 1 : 0;
  } catch (error) {
    stderr(`slm-eval: error: ${error && error.message ? error.message : String(error)}`);
    return 2;
  }
}

async function main(argv = process.argv.slice(2)) {
  const code = await runCli(argv);
  process.exitCode = code;
  return code;
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, runCli, main, USAGE };
