// Public API of the Local SLM Evaluation Kit.

const { TASKS, getTask, loadTasks } = require('./tasks.js');
const { SCORERS, getScorer, scoreOutput } = require('./metrics.js');
const { runSuite } = require('./runner.js');
const { renderCommand, runModel, DEFAULT_TIMEOUT_MS } = require('./adapter.js');
const { toJson, toMarkdown } = require('./report.js');
const { redact, maskValue, isPlaceholder } = require('./redact.js');

/**
 * Accepts either task objects or built-in task ids, so a caller can narrow
 * the suite without importing the task list first.
 *
 * @param {object[]|string[]|undefined} requested
 * @returns {object[]}
 */
function resolveTasks(requested) {
  if (!Array.isArray(requested)) return TASKS.slice();
  return requested.map((entry) => {
    if (typeof entry !== 'string') return entry;
    const task = getTask(entry);
    if (!task) throw new Error(`unknown task: ${entry}`);
    return task;
  });
}

/**
 * Convenience wrapper: runs the built-in suite (or a given task list) against
 * a command template.
 *
 * @param {{command?: string, tasks?: object[]|string[], timeoutMs?: number, model?: string, encoding?: string, env?: object}} [options]
 * @returns {Promise<object>}
 */
async function evaluate(options = {}) {
  const tasks = resolveTasks(options.tasks);
  const adapterConfig = {
    command: options.command,
    timeoutMs: options.timeoutMs,
    encoding: options.encoding,
    env: options.env,
  };
  const result = await runSuite(tasks, adapterConfig, { timeoutMs: options.timeoutMs });
  if (options.model) result.model = options.model;
  return result;
}

module.exports = {
  TASKS,
  getTask,
  loadTasks,
  SCORERS,
  getScorer,
  scoreOutput,
  runSuite,
  renderCommand,
  runModel,
  toJson,
  toMarkdown,
  redact,
  maskValue,
  isPlaceholder,
  evaluate,
  DEFAULT_TIMEOUT_MS,
};
