// Masks secrets and personal data in model output before it is written to a
// report. Model output is untrusted input, so it is never printed raw.

const PLACEHOLDERS = new Set([
  'your_api_key_here',
  'your-key-here',
  'xxxxxx',
  'xxxxxxxx',
  '<token>',
  '<your-token>',
  'changeme',
  'replace_me',
  'example.com',
  'dummy',
  'none',
  'n/a',
]);

/**
 * True when a value is an obvious placeholder rather than a real secret.
 * @param {*} value
 * @returns {boolean}
 */
function isPlaceholder(value) {
  const text = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  if (!text) return true;
  if (PLACEHOLDERS.has(text)) return true;
  if (/^x{3,}$/.test(text)) return true;
  if (/^<[^>]*>$/.test(text)) return true;
  if (/^(your|my|the)[-_ ]?(api[_ -]?key|token|secret|password)/.test(text)) return true;
  return false;
}

/**
 * Keeps a prefix/suffix hint of a value. Short values are masked completely,
 * because a four-character hint would leak most of the secret.
 * @param {*} value
 * @returns {string}
 */
function maskValue(value) {
  const text = String(value === null || value === undefined ? '' : value);
  if (!text) return '';
  if (text.length < 8) return '…';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

/**
 * Masks secret-looking substrings and personal data in a block of text.
 * @param {string|null|undefined} text
 * @returns {string}
 */
function redact(text) {
  if (text === null || text === undefined) return '';
  let out = String(text);

  // Private key blocks come first: they span several lines, and the
  // single-line patterns below would only mangle their first line.
  out = out.replace(
    /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
    '-----BEGIN RSA PRIVATE KEY----- [REDACTED PRIVATE KEY] -----END RSA PRIVATE KEY-----',
  );

  // Tokens keep their prefix so the reader can still tell what leaked.
  out = out.replace(/\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g, (match) => {
    const cut = match.indexOf('_') + 1;
    return `${match.slice(0, cut)}…${match.slice(-4)}`;
  });

  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, (match) => `${match.slice(0, 4)}…${match.slice(-4)}`);
  out = out.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, (match) => `${match.slice(0, 3)}…${match.slice(-4)}`);

  // Credential assignments: the key stays readable, the value is masked.
  out = out.replace(
    /((?:password|passwd|api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*)(["']?)([^\s"',;]{4,})\2/gi,
    (match, prefix, quote, value) => (isPlaceholder(value) ? match : `${prefix}${quote}${maskValue(value)}${quote}`),
  );

  // Email addresses keep the domain, because the domain is what makes the
  // finding actionable; the local part is reduced to a four-character hint.
  out = out.replace(
    /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    (match, local, domain) => `${local.slice(0, 4)}…@${domain}`,
  );

  return out;
}

module.exports = { redact, maskValue, isPlaceholder };
