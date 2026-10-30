# MONNA Agent Permission Diff

**Review what changed in your agent's declared permissions before you merge.**

[Try the public demo](https://emanalshazly.github.io/monna-agent-permission-diff/) · [Quality gates](docs/QUALITY.md)

Local CLI, in-browser demo and GitHub Action. No API key, model, telemetry, external dependency installation or MCP server execution. Reports reference exact source lines and omit all configuration values.

This project is a configuration-change reviewer, not a security scanner or an effective-permission evaluator. It is designed to complement tools such as MCP Inspector and Agent Scan.

## First useful result in three commands

```sh
git clone https://github.com/emanalshazly/monna-agent-permission-diff.git
cd monna-agent-permission-diff
node cli.mjs examples/before.json examples/after.json --format markdown --fail-on none
```

Requires Node 22+. No npm install. The supplied example reports six changes, including a removed deny rule, a removed approval rule, a new directory entry and a switch to bypass mode. It does not run the configured commands. MIT licensed; contributions welcome.

## Review your configuration

```sh
node cli.mjs before.json after.json --type claude-settings
node cli.mjs before.json after.json --type mcp --format markdown
node cli.mjs before.json after.json --format sarif --fail-on medium
```

Outputs: JSON (default), Markdown, SARIF 2.1.0. Exit codes: **0** below your chosen threshold, **1** review threshold reached, **2** invalid input or unsupported format. Default threshold is `high`. For conservative automation including unknown-field changes, select `medium`. `none` reports without failing.

SARIF uses generic `before.json` / `after.json` artifact names to avoid disclosing file paths; stage your files under those names when uploading SARIF. The tool produces SARIF; it does not upload it or automatically comment on pull requests.

## Supported formats and limits

| Format | Explicitly modeled fields |
|---|---|
| Claude settings | `permissions.allow`, `.deny`, `.ask`, `.additionalDirectories`, `.defaultMode` |
| MCP JSON | `mcpServers`; each server's `command`, ordered `args`, `url`, `type`, `env`, `headers`, `disabled` |

Client-specific extensions are not automatically understood. MCP JSON is a client configuration convention, not a complete authorization model defined by MCP itself. A server addition does not prove new runtime access. `disabled` semantics depend on the client. Unknown fields produce partial coverage; changed unknown fields produce review findings. Known cosmetic fields are not silently discarded in this initial release.

Permission lists compare as sets; executable arguments compare in order. Paths and rule expressions compare literally: no glob equivalence, path resolution, symlink following or managed-policy merging. Reports indicate potential expansion/reduction, never claim new effective access. Added allow and removed deny/ask rules still need review even when another rule might override them.

Strict UTF-8 JSON only: no JSONC, comments or trailing commas. Duplicate keys, nonfinite numbers and malformed consumed fields are rejected. Input limits: 2 MB bytes per file, 1 million characters, nesting depth 64 and 50,000 parsed nodes. Large inputs fail visibly rather than being truncated.

## GitHub Action

**Automatic PR mode:** see [PR review setup and measured limitations](docs/PR-REVIEW.md). It discovers changed configuration files and extracts both revisions automatically, with source links, review reasons and suggested actions. The two-file action below remains available for manual comparisons.

Use a reviewed commit SHA instead of a moving branch in production. Prepare `before.json` from the trusted base revision and `after.json` from the proposed change. Keep both files inside the workspace. The Action does not retrieve revisions or guess the base. Use `pull_request`, not privileged `pull_request_target`, for untrusted contribution code.

```yaml
permissions:
  contents: read
steps:
  # First check out your repository and prepare before.json / after.json.
  - uses: emanalshazly/monna-agent-permission-diff@e3e7ca3c8d363c08707e1020fc67acae244ce700
    with:
      before: before.json
      after: after.json
      type: claude-settings
      fail-on: medium
```

The action needs Node 22+ on the runner. It adds the redacted report to the job summary and exposes `report-path`. Input values are passed through environment variables and a shell-free argument array. It checks that file targets remain within the workspace, including symlink resolution. No write token is required. Pinning instructions will accompany the first verified release.

## Browser demo

The root `index.html` and ES modules are a static site with English/Arabic controls. Run `node preview.mjs` and open `http://127.0.0.1:8432`, or use any static HTTP server; opening the HTML via `file://` may block module imports. Select local files or paste JSON, then compare. Files are read using the browser File API and are not uploaded. Initial site assets are fetched normally; analysis itself makes no network calls. Findings retain stable English rule identifiers and descriptions.

## Verification and comparison

Read the [executed three-alternative comparison](docs/THREE-ALTERNATIVE-REVIEW.md), including pinned competitor versions, synthetic fixtures, raw results and competitor strengths. These scoped checks are not an overall security ranking.

Browser export buttons also reveal copyable report text. The optional Chromium tests below save completed Markdown and SARIF downloads, inspect their bytes in both English and Arabic, and check the copyable-text fallback when browser downloads are refused. Use that fallback or CLI output if downloads are blocked.

```sh
node --test
node benchmark/run.mjs
```

To run the browser checks, install the development-only test dependency with [Bun](https://bun.sh), then its Chromium browser:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run test:browser
```

Node 22+ must also be on PATH. On Linux, use `bunx playwright install --with-deps chromium` if browser system dependencies are missing. The test runner starts and stops `node preview.mjs`; port 8432 must be free. Six tests exercise fictional Claude settings and MCP environment changes, stable rule IDs, SARIF 2.1.0 results, canary redaction, and copyable text with downloads enabled and refused. Completed files are saved under ignored `test-results/` directories for inspection. This verifies local Chromium behavior, not other browsers, GitHub SARIF ingestion or effective permissions. Normal CLI and browser-demo use still need no dependency installation.

The suite covers malformed input, line evidence, permission changes, credential canaries, CLI behavior, GitHub summaries and deterministic comparisons. The benchmark is a small synthetic suite, not independent validation or proof of market superiority. See [comparison evidence](docs/COMPARISON.md) and [quality gates](docs/QUALITY.md).

## Why MONNA built this

Reviewers should see which authority-related settings changed without having to execute an unfamiliar MCP server or send its configuration for analysis. MONNA's focus is practical agent governance: explain the evidence, make uncertainty visible, keep the final decision with the owner.

[Report a reproducible issue](https://github.com/emanalshazly/monna-agent-permission-diff/issues) · [MONNA on GitHub](https://github.com/emanalshazly). Never include real tokens or private configuration values in public issues.
