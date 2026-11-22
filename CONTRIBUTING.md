# Contributing to Local SLM Evaluation Kit

Thanks for helping! This kit runs a repeatable evaluation suite
against a **local** small language model. It never links against a
specific runtime — it talks to the model through a command adapter:
a command template you supply, with the prompt substituted into it —
so the same tasks, scoring and report shape work against llama.cpp,
Ollama, a llamafile, or a Python script.

The most valuable contributions are new evaluation tasks, new
runtime adapters, and metrics with tests.

## Ground rules

- **Zero runtime dependencies — hard rule.** Node.js built-ins only.
- **Local means local.** The kit evaluates models on the user's own
  machine. Do not add hosted-API calls or telemetry.
- **Determinism is the point.** A change that makes scores or report
  shapes vary between identical runs is a regression, not a feature.

## Development setup

Requires Node.js 18 or newer. There is nothing to install:

```bash
git clone https://github.com/gravion-ux/local-slm-eval-kit.git
cd local-slm-eval-kit
npm test
```

## Running the tests

```bash
npm test        # the full suite
npm run check   # syntax-check every source file
```

CI runs both on Node 18, 20 and 22. List the kit's built-in tasks
with `npm run eval` (`node src/cli.js tasks`).

## Adding a task or adapter

- Tasks live with the task set in `src/tasks.js`; a new task needs a
  deterministic expected answer or scoring rule and a test in
  `test/tasks.test.js`.
- Adapters belong in `src/adapter.js`. An adapter is a command
  template — it must not assume a specific runtime's flags beyond
  what the template itself declares.
- If you add a source file, add it to the `check` script in
  `package.json` and to the `test` script's file list — both list
  files explicitly, so an unlisted file is never checked or run.

## Code style

- Plain Node.js, no build step; tests use the built-in `node --test`
  runner and live in `test/`.
- Comments explain *why* a metric or scoring rule is computed the
  way it is.

## Pull request workflow

1. Fork and branch from `main`: `feat/<short-name>`,
   `fix/<short-name>`, `task/<name>`, `docs/<short-name>`.
2. Run `npm run check` and the full suite locally.
3. Open the PR against `main` with: what changed, why, how you
   tested it.
4. CI must be green. One logical change per PR.
