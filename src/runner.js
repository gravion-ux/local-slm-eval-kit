// Runs tasks against an adapter and collects the results.
//
// Tasks run one after another, never in parallel: a local model is usually
// single-slot, and a serial run is the only one that is reproducible.

const { runModel, DEFAULT_TIMEOUT_MS } = require('./adapter.js');
const { scoreOutput } = require('./metrics.js');

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function tally(entries) {
  const total = entries.length;
  const passed = entries.filter((entry) => entry.passed).length;
  return {
    total,
    passed,
    passRate: total ? round4(passed / total) : 0,
  };
}

/**
 * @param {object[]} tasks
 * @param {object} adapterConfig
 * @param {{timeoutMs?: number, tasks?: string[], onResult?: Function, onError?: Function, runModel?: Function}} [options]
 * @returns {Promise<object>}
 */
async function runSuite(tasks, adapterConfig, options = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const config = adapterConfig || {};
  const wanted = Array.isArray(options.tasks) ? new Set(options.tasks) : null;
  const selected = wanted ? list.filter((task) => wanted.has(task.id)) : list.slice();
  const execute = typeof options.runModel === 'function' ? options.runModel : runModel;
  // The timeout the child actually gets, so a timeout is reported with the
  // number that was really in force rather than an undefined placeholder.
  const effectiveTimeoutMs = Number(options.timeoutMs || config.timeoutMs || DEFAULT_TIMEOUT_MS);

  const startedAt = new Date().toISOString();
  const started = Date.now();
  const results = [];

  for (const task of selected) {
    const taskStarted = Date.now();
    let result;

    try {
      const run = await execute(config, task.prompt, { timeoutMs: options.timeoutMs });
      const scored = scoreOutput(run.output, task);
      result = {
        taskId: task.id,
        name: task.name || task.id,
        category: task.category || 'unknown',
        scorer: task.scorer,
        passed: scored.pass && !run.timedOut,
        score: run.timedOut ? 0 : scored.score,
        detail: run.timedOut ? 'timed out' : scored.detail,
        output: run.output,
        durationMs: run.durationMs,
        timedOut: Boolean(run.timedOut),
        error: run.timedOut ? `timed out after ${effectiveTimeoutMs}ms` : null,
      };
    } catch (error) {
      // One broken task must not end the suite; the error is recorded instead.
      result = {
        taskId: task.id,
        name: task.name || task.id,
        category: task.category || 'unknown',
        scorer: task.scorer,
        passed: false,
        score: 0,
        detail: 'error',
        output: '',
        durationMs: Date.now() - taskStarted,
        timedOut: false,
        error: error && error.message ? error.message : String(error),
      };
      if (typeof options.onError === 'function') options.onError(error);
    }

    results.push(result);
    if (typeof options.onResult === 'function') options.onResult(result);
  }

  const finishedAt = new Date().toISOString();
  const byCategory = {};
  const byScorer = {};
  for (const result of results) {
    byCategory[result.category] = byCategory[result.category] || [];
    byCategory[result.category].push(result);
    byScorer[result.scorer] = byScorer[result.scorer] || [];
    byScorer[result.scorer].push(result);
  }

  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const errors = results.filter((result) => result.error).length;
  const meanScore = total
    ? round4(results.reduce((sum, result) => sum + Number(result.score || 0), 0) / total)
    : 0;

  return {
    startedAt,
    finishedAt,
    durationMs: Date.now() - started,
    results,
    summary: {
      total,
      passed,
      failed: total - passed,
      errors,
      passRate: total ? round4(passed / total) : 0,
      meanScore,
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([key, entries]) => [key, tally(entries)])),
      byScorer: Object.fromEntries(Object.entries(byScorer).map(([key, entries]) => [key, tally(entries)])),
    },
  };
}

module.exports = { runSuite };
