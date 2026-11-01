# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-31

### Added

- Command adapter that runs a local model through a user-supplied command template, with
  the prompt substituted as base64 (`{{prompt}}` and `{{prompt_b64}}`).
- Built-in evaluation suite of ten tasks across instruction-following, format, safety and
  reasoning.
- Six scorers: `exact`, `contains`, `json`, `regex`, `not-contains` and `length`.
- Suite runner that executes tasks serially, records timeouts and adapter failures
  without stopping the run, and reports pass rate, mean score and category/scorer
  breakdowns.
- JSON and Markdown reports with a stable key order, suitable for diffing between runs.
- Redaction of secrets and personal data in model output before it reaches a report.
- CLI with `run`, `tasks` and `scorers` commands, and documented exit codes.
- Task-suite loader that reads a JSON file of custom tasks.
- CI workflow running the test suite and the syntax check on Node 18, 20 and 22.

[0.1.0]: https://github.com/gravion-ux/local-slm-eval-kit/releases/tag/v0.1.0
