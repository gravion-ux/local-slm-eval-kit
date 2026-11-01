// Renders the suite result as JSON and as Markdown. Every model answer goes
// through redaction first: the output is untrusted text.

const { redact } = require('./redact.js');

const TOOL = 'local-slm-eval-kit';
const SCHEMA_VERSION = 1;

function cell(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\|/g, '\\|');
}

function modelName(result, meta) {
  return String((meta && meta.model) || (result && result.model) || 'unknown');
}

function serialiseResult(item) {
  return {
    taskId: item.taskId,
    name: item.name,
    category: item.category,
    scorer: item.scorer,
    passed: item.passed,
    score: item.score,
    detail: item.detail,
    output: redact(item.output),
    durationMs: item.durationMs,
    timedOut: item.timedOut,
    error: item.error === undefined ? null : item.error,
  };
}

/**
 * @param {object} result
 * @param {{model?: string}} [meta]
 * @returns {string}
 */
function toJson(result, meta = {}) {
  const run = result || {};
  const summary = run.summary || {};
  const payload = {
    tool: TOOL,
    schemaVersion: SCHEMA_VERSION,
    model: modelName(run, meta),
    startedAt: run.startedAt || null,
    finishedAt: run.finishedAt || null,
    durationMs: run.durationMs || 0,
    summary: {
      total: summary.total || 0,
      passed: summary.passed || 0,
      failed: summary.failed || 0,
      errors: summary.errors || 0,
      passRate: summary.passRate || 0,
      meanScore: summary.meanScore || 0,
      byCategory: summary.byCategory || {},
      byScorer: summary.byScorer || {},
    },
    results: (run.results || []).map(serialiseResult),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * @param {object} result
 * @param {{model?: string}} [meta]
 * @returns {string}
 */
function toMarkdown(result, meta = {}) {
  const run = result || {};
  const summary = run.summary || {};
  const results = run.results || [];
  const lines = [];

  lines.push('# Local SLM Evaluation Report');
  lines.push('');
  lines.push(`- Model: \`${modelName(run, meta)}\``);
  lines.push(`- Started: \`${run.startedAt || 'unknown'}\``);
  lines.push(`- Finished: \`${run.finishedAt || 'unknown'}\``);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Pass rate: ${summary.passRate || 0}`);
  lines.push(`- Mean score: ${summary.meanScore || 0}`);
  lines.push(`- Total: ${summary.total || 0}`);
  lines.push(`- Passed: ${summary.passed || 0}`);
  lines.push(`- Failed: ${summary.failed || 0}`);
  lines.push(`- Errors: ${summary.errors || 0}`);
  lines.push('');

  lines.push('## Results');
  lines.push('');
  if (!results.length) {
    lines.push('No results.');
  } else {
    lines.push('| Task | Category | Scorer | Passed | Score | Detail |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of results) {
      lines.push(`| ${cell(item.taskId)} | ${cell(item.category)} | ${cell(item.scorer)} | ${item.passed ? 'yes' : 'no'} | ${cell(item.score)} | ${cell(item.detail)} |`);
    }
  }
  lines.push('');

  // The answers themselves are the part a reader needs to judge a failure, so
  // they are included - but only after redaction.
  lines.push('## Outputs');
  lines.push('');
  if (!results.length) {
    lines.push('No outputs.');
  } else {
    for (const item of results) {
      lines.push(`### ${cell(item.taskId)}`);
      lines.push('');
      const body = redact(item.output);
      lines.push(body ? body.replace(/`/g, '\\`') : '(empty)');
      lines.push('');
    }
  }

  lines.push('## Category breakdown');
  lines.push('');
  lines.push('| Category | Total | Passed | Pass rate |');
  lines.push('| --- | --- | --- | --- |');
  for (const [category, tally] of Object.entries(summary.byCategory || {})) {
    lines.push(`| ${cell(category)} | ${tally.total} | ${tally.passed} | ${tally.passRate} |`);
  }
  lines.push('');

  lines.push('## Scorer breakdown');
  lines.push('');
  lines.push('| Scorer | Total | Passed | Pass rate |');
  lines.push('| --- | --- | --- | --- |');
  for (const [scorer, tally] of Object.entries(summary.byScorer || {})) {
    lines.push(`| ${cell(scorer)} | ${tally.total} | ${tally.passed} | ${tally.passRate} |`);
  }

  return lines.join('\n');
}

module.exports = { toJson, toMarkdown, TOOL, SCHEMA_VERSION };
