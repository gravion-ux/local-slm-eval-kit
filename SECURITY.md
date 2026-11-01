# Security Policy

## Reporting a vulnerability

Please report security issues privately to **priyanshukumarthakur.dev@gmail.com**. Include
the steps to reproduce, the affected version, and what an attacker gains. You can expect an
acknowledgement within a week.

Do not open a public issue for a vulnerability before it has been addressed.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## How the kit handles untrusted data

Model output is **untrusted input**. It is treated as data and never as instructions:

- Every model answer passes through `redact()` before it is written to a JSON or Markdown
  report or printed. Private key blocks, AWS access key ids, GitHub tokens, `sk-` keys,
  credential assignments and email addresses are masked.
- Placeholder values (`your_api_key_here`, `changeme`, `<token>`, ...) are deliberately
  left untouched, so a report does not fill up with false positives.
- The kit never prints a full secret, in a report or in an error message.

## How the kit handles the command you supply

`--command` is a command template you provide, and the kit runs it with
`child_process.execFile` — **without a shell**. The prompt is inserted as base64, so it
cannot inject shell metacharacters into the command line.

That still means the command template itself is trusted input: it is your command, and it
runs with your privileges. The kit does not sandbox it, and it cannot make an arbitrary
command safe. Only point it at a model runtime you trust.

The child process inherits your environment plus any variables you pass through the
adapter's `env` option, and is killed if it exceeds the configured timeout.

## Scope

The kit reads the model output it is given and writes reports. It does not download
models, make network requests of its own, or write anything outside the report paths you
name on the command line.
