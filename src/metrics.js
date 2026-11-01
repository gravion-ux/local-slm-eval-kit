// The metric functions. Every scorer turns a model answer into a score
// between 0 and 1, a pass flag, and a short human-readable detail.

const { isDeepStrictEqual } = require('node:util');

const SCORERS = ['exact', 'contains', 'json', 'regex', 'not-contains', 'length'];

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * @param {string} output
 * @param {object} task
 * @returns {{score: number, pass: boolean, detail: string}}
 */
function scoreExact(output, task = {}) {
  const expected = text(task.expected).trim();
  const actual = text(output).trim();
  if (actual === expected) return { score: 1, pass: true, detail: 'exact match' };
  return { score: 0, pass: false, detail: `expected "${expected}"` };
}

/**
 * @param {string} output
 * @param {object} task
 * @returns {{score: number, pass: boolean, detail: string}}
 */
function scoreContains(output, task = {}) {
  const phrases = Array.isArray(task.expectedAny)
    ? task.expectedAny
    : (task.expected !== undefined && task.expected !== null ? [task.expected] : []);
  const body = text(output);
  for (const phrase of phrases) {
    if (body.includes(text(phrase))) {
      return { score: 1, pass: true, detail: `matched "${text(phrase)}"` };
    }
  }
  return { score: 0, pass: false, detail: 'missing' };
}

/**
 * @param {string} output
 * @param {object} task
 * @returns {{score: number, pass: boolean, detail: string}}
 */
function scoreNotContains(output, task = {}) {
  const forbidden = Array.isArray(task.forbidden) ? task.forbidden : [];
  const body = text(output);
  for (const phrase of forbidden) {
    if (body.includes(text(phrase))) {
      return { score: 0, pass: false, detail: `forbidden "${text(phrase)}"` };
    }
  }
  return { score: 1, pass: true, detail: 'clean' };
}

/**
 * Pulls the first balanced {...} or [...] block out of a block of text.
 *
 * The scan skips braces that sit inside a JSON string, and it returns the
 * first complete block rather than everything up to the last closing brace:
 * an answer may well contain more than one block.
 *
 * @param {string} body
 * @returns {string|null}
 */
function extractJsonBlock(body) {
  for (let start = 0; start < body.length; start += 1) {
    const opener = body[start];
    if (opener !== '{' && opener !== '[') continue;
    const closer = opener === '{' ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < body.length; i += 1) {
      const ch = body[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === opener) depth += 1;
      else if (ch === closer) {
        depth -= 1;
        if (depth === 0) return body.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * @param {string} output
 * @param {object} task
 * @returns {{score: number, pass: boolean, detail: string}}
 */
function scoreJson(output, task = {}) {
  const body = text(output).trim();
  let parsed = null;
  let parsedOk = false;

  try {
    parsed = JSON.parse(body);
    parsedOk = true;
  } catch (_) {
    parsedOk = false;
  }

  if (!parsedOk) {
    const block = extractJsonBlock(body);
    if (block !== null) {
      try {
        parsed = JSON.parse(block);
        parsedOk = true;
      } catch (_) {
        parsedOk = false;
      }
    }
  }

  if (!parsedOk) return { score: 0, pass: false, detail: 'invalid json' };
  if (!isDeepStrictEqual(parsed, task.expected)) return { score: 0, pass: false, detail: 'mismatch' };
  return { score: 1, pass: true, detail: 'json ok' };
}

/**
 * @param {string} output
 * @param {object} task
 * @returns {{score: number, pass: boolean, detail: string}}
 */
function scoreRegex(output, task = {}) {
  const body = text(output);
  const source = task.pattern instanceof RegExp ? task.pattern.source : String(task.pattern || '');
  const flags = task.pattern instanceof RegExp
    ? task.pattern.flags.replace(/g/g, '')
    : '';
  let matched = false;
  try {
    matched = new RegExp(source, flags).test(body);
  } catch (_) {
    matched = false;
  }
  if (matched) return { score: 1, pass: true, detail: 'matched' };
  return { score: 0, pass: false, detail: 'no match' };
}

/**
 * @param {string} output
 * @param {object} task
 * @returns {{score: number, pass: boolean, detail: string}}
 */
function scoreLength(output, task = {}) {
  const limit = Number(task.maxChars);
  const length = text(output).length;
  if (!Number.isFinite(limit)) {
    return { score: 0, pass: false, detail: `length ${length}, no limit` };
  }
  if (length <= limit) {
    return { score: 1, pass: true, detail: `length ${length} <= limit ${limit}` };
  }
  // Partial credit keeps the mean score useful when ranking two models.
  return { score: Math.max(0, limit / length), pass: false, detail: `length ${length} > limit ${limit}` };
}

const SCORER_FUNCTIONS = {
  exact: scoreExact,
  contains: scoreContains,
  json: scoreJson,
  regex: scoreRegex,
  'not-contains': scoreNotContains,
  length: scoreLength,
};

/**
 * @param {string} name
 * @returns {(output: string, task: object) => {score: number, pass: boolean, detail: string}}
 */
function getScorer(name) {
  const key = String(name === null || name === undefined ? '' : name);
  const scorer = SCORER_FUNCTIONS[key];
  if (!scorer) throw new Error(`unknown scorer: ${key}`);
  return scorer;
}

/**
 * Scores one model answer against one task.
 * @param {string} output
 * @param {object} task
 * @returns {{score: number, pass: boolean, detail: string}}
 */
function scoreOutput(output, task = {}) {
  const scorer = getScorer(task.scorer);
  const result = scorer(output, task);
  const score = Number(result.score);
  return {
    score: Math.min(1, Math.max(0, Number.isFinite(score) ? score : 0)),
    pass: Boolean(result.pass),
    detail: String(result.detail || ''),
  };
}

module.exports = {
  SCORERS,
  getScorer,
  scoreOutput,
  scoreExact,
  scoreContains,
  scoreNotContains,
  scoreJson,
  scoreRegex,
  scoreLength,
  extractJsonBlock,
};
