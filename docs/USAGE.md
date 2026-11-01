# Usage

## Commands

```
slm-eval run --command "<template>" [--task <id>] [--tasks <file.json>]
        [--model <name>] [--timeout <ms>] [--json <out.json>] [--md <out.md>] [--quiet]
slm-eval tasks [--json]
slm-eval scorers [--json]
```

| Option | Meaning |
| --- | --- |
| `--command <template>` | the command that runs the model. Required for `run`. |
| `--task <id>` | run only this task. Repeatable in the API, single-valued in the CLI. |
| `--tasks <file.json>` | read the task suite from a JSON file instead of the built-in one. |
| `--model <name>` | the model name to record in the report. It is a label; the kit never loads a model. |
| `--timeout <ms>` | kill the child process after this many milliseconds. Default 30000. |
| `--json <out.json>` | write the JSON report to this path. |
| `--md <out.md>` | write the Markdown report to this path. |
| `--quiet` | suppress the human summary on stdout. |

For `tasks` and `scorers`, `--json` without a value prints the catalogue as JSON on
stdout; with a path, the JSON is written to that file and the text catalogue is printed.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | every selected task passed |
| 1 | at least one task failed |
| 2 | usage error — bad arguments, or an unreadable/invalid task file |
| 3 | the model command could not be run at all (it could not be spawned) |

A failing task does not stop the suite: every task runs, the failures are counted, and the
process exits 1 at the end.

## The command template

The template is a command line with one placeholder:

| Placeholder | Replaced with |
| --- | --- |
| `{{prompt}}` | the base64 encoding of the prompt (UTF-8) |
| `{{prompt_b64}}` | the same thing, written explicitly |

```bash
# llama.cpp: the runtime takes a base64 prompt with --no-display-prompt
slm-eval run --command "llama-cli -m model.gguf -p {{prompt_b64}} --no-display-prompt"

# Ollama: the runtime takes the raw prompt
slm-eval run --command "ollama run llama3 {{prompt}}"
```

Base64 is the default because a prompt can contain quotes, newlines and backslashes, and a
raw substitution would break the command line.

**The template is split into argv and run without a shell.** Quotes group arguments, and a
backslash is literal unless it escapes a quote — so Windows paths survive intact:

```
"C:\Program Files\nodejs\node.exe" -e "console.log('hi')"
```

becomes the three arguments `C:\Program Files\nodejs\node.exe`, `-e` and
`console.log('hi')`.

Because no shell is involved, `|`, `>` and `&&` are **not** interpreted. Put such a
pipeline in a wrapper script and point `--command` at the script.

## The adapter configuration

The CLI builds the adapter from the command line. In the API you can set more:

```js
const { runSuite } = require('local-slm-eval-kit');

const result = await runSuite(tasks, {
  command: 'llama-cli -m model.gguf -p {{prompt_b64}} --no-display-prompt',
  encoding: 'base64',   // 'base64' (default) or 'raw'
  timeoutMs: 30000,
  env: { OMP_NUM_THREADS: '4' },
  strip: true,          // trim the captured output
});
```

With `encoding: 'raw'` the prompt is substituted verbatim. Only use it with a runtime that
takes the prompt as one argument and with templates you control.

## Writing your own task suite

A task file is a JSON array, or an object with a `tasks` array:

```json
[
  {
    "id": "my-task",
    "name": "My task",
    "description": "What this task checks.",
    "category": "format",
    "scorer": "exact",
    "prompt": "Reply with exactly: ok",
    "expected": "ok"
  }
]
```

```bash
slm-eval run --command "ollama run llama3 {{prompt}}" --tasks my-tasks.json
```

A task is rejected — with an error naming the task — when it has no `id`, no `prompt`, an
unknown scorer, or no input for its scorer.

## The report

The JSON report is stable, so two runs can be diffed:

```
tool, schemaVersion, model, startedAt, finishedAt, durationMs, summary, results
```

Each result is:

```
taskId, name, category, scorer, passed, score, detail, output, durationMs, timedOut, error
```

The summary holds `total`, `passed`, `failed`, `errors`, `passRate`, `meanScore`, and the
`byCategory` / `byScorer` breakdowns. The pass rate and the mean score are rounded to four
decimals.

Model answers are redacted before they are written, so a report can be committed without
leaking a key the model happened to echo.

## The API

```js
const {
  TASKS, getTask, loadTasks,
  SCORERS, getScorer, scoreOutput,
  runSuite, renderCommand, runModel,
  toJson, toMarkdown, redact, maskValue,
  evaluate,
} = require('local-slm-eval-kit');

const result = await evaluate({ command: 'ollama run llama3 {{prompt}}', model: 'llama3' });
console.log(result.summary.passRate);
```

`evaluate()` is the one-call wrapper around `runSuite()`. `runSuite()` gives you the
options: `tasks` (a subset of task ids), `timeoutMs`, `onResult` and `onError`.
