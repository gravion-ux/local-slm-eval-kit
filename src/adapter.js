// The command adapter. Small models are served in wildly different ways, so
// the kit never links against a runtime: the user supplies a command template
// and the prompt is substituted into it.

const { execFile } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 30000;
const PROMPT_PLACEHOLDER = /\{\{prompt_b64\}\}|\{\{prompt\}\}/g;

/**
 * Encodes a prompt for substitution.
 * @param {string} prompt
 * @param {string} [encoding] 'base64' (default) or 'raw'
 * @returns {string}
 */
function encodePrompt(prompt, encoding) {
  const text = prompt === null || prompt === undefined ? '' : String(prompt);
  if (encoding === 'raw') return text;
  return Buffer.from(text, 'utf8').toString('base64');
}

/**
 * Substitutes the prompt into a command template.
 * @param {{command?: string, encoding?: string}} config
 * @param {string} prompt
 * @returns {string}
 */
function renderCommand(config, prompt) {
  const template = String((config && config.command) || '');
  const value = encodePrompt(prompt, config && config.encoding);
  // A function replacement keeps `$&` and friends in a raw prompt literal.
  return template.replace(PROMPT_PLACEHOLDER, () => value);
}

/**
 * Splits a command template into argv. Quotes group arguments; a backslash is
 * literal unless it escapes a quote, so Windows paths survive intact.
 * @param {string} template
 * @returns {string[]}
 */
function parseCommand(template) {
  const text = String(template || '');
  const argv = [];
  let current = '';
  let quote = null;
  let started = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      // Inside a quoted argument a backslash escapes a quote and nothing else.
      // Every other backslash stays literal, so a Windows path survives.
      if (ch === '\\') {
        const next = text[i + 1];
        if (next === '"' || next === "'") {
          current += next;
          i += 1;
          continue;
        }
        current += ch;
        continue;
      }
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === '"' || next === "'") {
        current += next;
        started = true;
        i += 1;
        continue;
      }
      current += ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current || started) {
        argv.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    current += ch;
    started = true;
  }
  if (current || started) argv.push(current);
  return argv;
}

/**
 * Runs the model command once.
 *
 * A non-zero exit is a result, not a crash, so it is returned. Only a command
 * that cannot be spawned at all rejects, because that is a setup failure the
 * caller has to know about.
 *
 * @param {{command?: string, encoding?: string, timeoutMs?: number, env?: object, strip?: boolean}} config
 * @param {string} prompt
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{output: string, stdout: string, stderr: string, code: number|null, timedOut: boolean, durationMs: number}>}
 */
function runModel(config, prompt, options = {}) {
  const cfg = config || {};
  const argv = parseCommand(String(cfg.command || '').trim());
  if (!argv.length) {
    const error = new Error('no command configured: set adapter.command');
    error.code = 'NO_COMMAND';
    error.spawnFailed = true;
    return Promise.reject(error);
  }

  const timeoutMs = Number(options.timeoutMs || cfg.timeoutMs || DEFAULT_TIMEOUT_MS);
  const started = Date.now();

  return new Promise((resolve, reject) => {
    execFile(
      argv[0],
      argv.slice(1),
      {
        timeout: timeoutMs,
        env: { ...process.env, ...(cfg.env || {}) },
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - started;
        const outText = stdout === null || stdout === undefined ? '' : String(stdout);
        const errText = stderr === null || stderr === undefined ? '' : String(stderr);

        // A string code means the child never started (ENOENT, EACCES, ...).
        if (error && typeof error.code === 'string' && error.code !== 'ETIMEDOUT') {
          const failure = new Error(`could not run "${argv[0]}": ${error.message}`);
          failure.code = error.code;
          failure.spawnFailed = true;
          reject(failure);
          return;
        }

        let timedOut = false;
        let code = 0;
        if (error) {
          timedOut = Boolean(error.killed) || error.signal === 'SIGTERM';
          code = timedOut ? null : (typeof error.code === 'number' ? error.code : 1);
        }

        const output = cfg.strip === false ? outText : outText.trim();
        resolve({ output, stdout: outText, stderr: errText, code, timedOut, durationMs });
      },
    );
  });
}

module.exports = { renderCommand, runModel, parseCommand, DEFAULT_TIMEOUT_MS };
