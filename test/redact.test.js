// Tests for redaction: a report must never carry a whole secret.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { redact, maskValue, isPlaceholder } = require('../src/redact.js');

test('redact maps empty and missing input to an empty string', () => {
  assert.equal(redact(''), '');
  assert.equal(redact(null), '');
  assert.equal(redact(undefined), '');
});

test('redact masks an AWS access key id', () => {
  assert.equal(redact('AKIAIOSFODNN7EXAMPLE'), 'AKIA…MPLE');
});

test('redact masks a GitHub token but keeps its prefix', () => {
  const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
  const masked = redact(token);
  assert.ok(masked.startsWith('ghp_…'), masked);
  assert.ok(masked.endsWith('6789'), masked);
  assert.ok(!masked.includes('abcdefghij'), masked);
});

test('redact masks an sk- key', () => {
  const masked = redact('sk-abcdefghijklmnopqrstuvwxyz');
  assert.ok(masked.startsWith('sk-…'), masked);
});

test('redact replaces a private key block', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----';
  const masked = redact(pem);
  assert.equal(masked, '-----BEGIN RSA PRIVATE KEY----- [REDACTED PRIVATE KEY] -----END RSA PRIVATE KEY-----');
  assert.ok(!masked.includes('MIIBOgIBAAJBAK'), masked);
});

test('redact masks the value of a credential assignment', () => {
  assert.equal(redact('password = "hunter2hunter2"'), 'password = "hunt…ter2"');
});

test('redact leaves a placeholder credential alone', () => {
  const line = 'api_key = "your_api_key_here"';
  assert.equal(redact(line), line);
});

test('redact masks an email address but keeps the domain', () => {
  assert.equal(redact('write to user@example.com'), 'write to user…@example.com');
});

test('maskValue keeps a prefix and a suffix', () => {
  assert.equal(maskValue('abcdefghijklmnop'), 'abcd…mnop');
});

test('maskValue masks a short value completely', () => {
  assert.equal(maskValue('short'), '…');
  assert.equal(maskValue(''), '');
});

test('isPlaceholder knows the usual placeholders', () => {
  assert.equal(isPlaceholder('your_api_key_here'), true);
  assert.equal(isPlaceholder('xxxxxx'), true);
  assert.equal(isPlaceholder('<token>'), true);
  assert.equal(isPlaceholder('changeme'), true);
});

test('isPlaceholder rejects a real secret', () => {
  assert.equal(isPlaceholder('s3cretValue'), false);
});
