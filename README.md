# Local SLM Evaluation Kit

[![CI](https://github.com/gravion-ux/local-slm-eval-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/gravion-ux/local-slm-eval-kit/actions/workflows/ci.yml)

Runs a repeatable evaluation suite against a **local** small language model.

Small models are served in wildly different ways — llama.cpp's `llama-cli`, Ollama's
`ollama run`, a llamafile, a Python script — so this kit never links against a specific
runtime. It talks to the model through a **command adapter**: a command template you supply,
with the prompt substituted into it.

The point is to turn "is this model good enough for my task?" into an answer you can get in
one command, with deterministic metrics and a report you can diff between runs.

## Why this exists

Choosing a small model is guesswork unless you can measure it. Cloud benchmarks do not
predict how a 3B model behaves on *your* prompts, with *your* runtime, on *your* machine.
Running a model locally is cheap and fast, but a local answer is only useful if the
evaluation is repeatable: the same tasks, the same scoring, the same report shape, every
time. That is what this kit provides.

## Install

```bash
git clone https://github.com/gravion-ux/local-slm-eval-kit.git
cd local-slm-eval-kit
npm install
```

There are **zero runtime and zero dev dependencies**. Node 18 or newer is the only
requirement. The kit never downloads a model.

## Usage

```bash
# Run the built-in suite against a llama.cpp model
slm-eval run --command "llama-cli -m model.gguf -p {{prompt_b64}} --no-display-prompt" --model llama3.2-3b

# Against Ollama, where the prompt is passed as-is
slm-eval run --command "ollama run llama3 {{prompt}}" --model llama3

# A single task, with both reports written to disk
slm-eval run --command "ollama run llama3 {{prompt}}" --task json-extraction \
  --json report.json --md report.md

# The catalogues
slm-eval tasks
slm-eval scorers --json
```

`{{prompt}}` and `{{prompt_b64}}` are both replaced by the **base64** encoding of the
prompt, so a prompt containing quotes or newlines cannot break the command line. If your
runtime wants the raw text, use an adapter with `encoding: 'raw'` (see `docs/USAGE.md`).

Full option reference: [`docs/USAGE.md`](docs/USAGE.md).

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | every selected task passed |
| 1 | at least one task failed |
| 2 | usage error (bad arguments, unreadable task file) |
| 3 | the model command could not be run at all |

## The built-in tasks

| id | category | scorer | What it checks |
| --- | --- | --- | --- |
| `exact-greeting` | instruction-following | exact | the answer is exactly the expected string |
| `contains-keyword` | instruction-following | contains | the answer contains a required keyword |
| `not-contains-forbidden` | safety | not-contains | the answer avoids a forbidden phrase |
| `json-extraction` | format | json | the answer parses as JSON and deep-equals the expected object |
| `json-with-prose` | format | json | the answer still contains the JSON object inside prose |
| `regex-date` | format | regex | the answer matches a date pattern |
| `length-limit` | instruction-following | length | the answer is within a maximum length |
| `refusal-refused` | safety | contains | the answer complies instead of refusing |
| `list-count` | reasoning | contains | the answer contains the expected count |
| `no-hallucination` | reasoning | not-contains | the answer does not invent a detail it was never given |

Descriptions and the fields each task expects: [`docs/TASKS.md`](docs/TASKS.md).

## The scorers

| Scorer | Passes when | Score |
| --- | --- | --- |
| `exact` | the trimmed output equals `expected` | 1 or 0 |
| `contains` | the output contains one of `expectedAny` (or `expected`) | 1 or 0 |
| `not-contains` | the output contains none of `forbidden` | 1 or 0 |
| `json` | the output parses as JSON (directly, or as the first `{...}`/`[...]` block) and deep-equals `expected` | 1 or 0 |
| `regex` | the output matches `pattern` | 1 or 0 |
| `length` | the output is at most `maxChars` long | 1, or a proportional partial score |

## The report

The JSON report has a stable key order, so two runs diff cleanly:

```json
{
  "tool": "local-slm-eval-kit",
  "schemaVersion": 1,
  "model": "llama3.2-3b",
  "startedAt": "2026-10-31T12:00:00.000Z",
  "finishedAt": "2026-10-31T12:00:07.000Z",
  "durationMs": 7000,
  "summary": { "total": 10, "passed": 8, "failed": 2, "errors": 0, "passRate": 0.8, "meanScore": 0.83 },
  "results": []
}
```

The Markdown report holds the same numbers as tables, plus the model answers themselves.

**Model output is untrusted.** Every answer passes through a redaction step before it is
written to a report: private key blocks, AWS access key ids, GitHub tokens, `sk-` keys,
credential assignments and email addresses are masked. Placeholder values such as
`your_api_key_here` are left alone, because flagging them would be noise.

## Development

```bash
npm test    # node:test, no dependencies
npm run check
```

## License

MIT — see [LICENSE](LICENSE).
