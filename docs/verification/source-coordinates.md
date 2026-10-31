# Same-file source coordinates in CLI and browser reports

Base: `7555911a4990338791853c7f363c01941a2fd376`.
[Machine-readable results](source-coordinates/results.json) retain the tested
source SHA-256 values, exact input hashes, measured locations and all CLI/browser
report hashes. Only fictional configurations were used.

## Reproduction and cause

The same valid, CR-only JSON files produce different evidence through the two
entry points. The CLI reports the added allow entry at line1,column43; the
browser's actual file-input flow reports line4,column7. Chromium normalizes the
textarea's CRs to LFs, while the parser originally indexed only LFs in the CLI's
unmodified text. Mixed CR/LF/CRLF input has the same inconsistency.

The browser's saved SARIF makes the problem observable outside the app. With
no `newlineSequences`, its declared default recognizes CRLF and LF, so the
original CR-only file has one line under that convention. Its line4 region
cannot be resolved. The [actual source files and SARIF downloads](source-coordinates/cr/)
are retained without editing; the baseline report is intentionally wrong.

The parser now indexes CRLF, CR and LF, counting CRLF once without changing
source text or parsed string data. SARIF declares that line-break policy and
the parser's UTF-16 column units. This aligns the CLI, browser and original-file
coordinate replay. Rule codes, findings, severity, direction, coverage and
redaction are unchanged. LF/CRLF inputs retain their existing coordinates.

GitHub blob anchors use a different convention: LF determines the numbered
blob rows, including for CR-only input. The public CR fixture was checked in
an isolated browser and had one numbered row. PR review therefore retains
universal text coordinates in its generic report and separately translates
only the cited line numbers for GitHub links. The added `githubEvidence`
contains numbers, not configuration text. Older saved PR results retain their
existing formatter fallback. Native `git grep -n` supplies independent expected
anchors in CR-only and mixed-line-ending PR regressions.

[SARIF2.1.0 sections3.14.26–27](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html)
define the default line-break convention, greedy separator ordering and the
required column-unit declaration for text results. The astral-prefix control's
coordinates were already correct before the fix; its missing unit declaration
was a separate facet of this same incomplete coordinate contract.

## Matched executed checks

Local Node24.3.0, Bun1.4.4, Playwright1.64.1 and Chrome for Testing156.0.8078.4
on macOS arm64. No packages were installed. The same final test/harness files
ran against unchanged production code from base, then the fixed production
code. The browser check uses the existing optional Playwright installation;
it is not a new production dependency or a dependency on PR3.

| Check | Before | After |
| --- | --- | --- |
| Existing `node --test` | 40 pass | included in49 pass |
| Nine new tests | 4 fail /5 pass | 9 pass |
| `node benchmark/run.mjs` | 10/10 fixtures pass | 10/10 fixtures pass |
| Six native browser workflows | 4 fail /2 pass | 6 pass |
| Completed browser downloads per stage | 18 | 18 |
| HTTP requests during analysis/export | 0 | 0 |

The two native-Git link controls pass on the original base and final fix.
They fail on intermediate commit `81461d4`, which changed the shared parser
before the GitHub adapter was added. That regression was found by the live
fixture check and corrected in this same PR. It is not an additional claimed
outcome or a second PR. The public observation and actual test results are
recorded in the machine-readable evidence.

The browser workflows cover LF, CRLF, CR-only and mixed breaks for Claude
settings, CR-only MCP endpoints in Arabic UI, and an astral Unicode prefix.
They write valid original files, invoke the real CLI in three formats, load
those same files through native file inputs, compare and save JSON, Markdown
and SARIF downloads. No File API, parser, response or download mocks are used.

Every completed download is nonempty, redacted and identical to the copyable
fallback. After removing exactly the one terminal LF added by CLI
`console.log`, its renderer bytes equal the CLI output. Source-region replay
uses each SARIF run's own declared separators against the **original files**.
The CR/mixed failures persist in that independent replay on base; LF/CRLF are
passing controls. All six matched pairs have identical raw input bytes and
unchanged non-coordinate finding content before/after.

The Node regressions additionally preserve escaped control characters as
string data and check duplicate-key diagnostics use the same physical lines
without echoing the fictional canary. They also enforce the explicit column
unit for an astral character preceding a grant on one line.

## Repeat

```sh
node --test
node benchmark/run.mjs
node verification/coordinate-evidence.mjs
BUN=/path/to/bun node verification/coordinate-workflow.mjs /tmp/coordinates-new-run
```

The last command requires an existing Playwright package/Chromium installation
and an unused localhost8432. `PLAYWRIGHT_MODULE` can name an existing module
path if it is outside the checkout. The harness starts and stops its own Bun
preview, creates a fresh output directory and retains every file/report plus
`results.json`. It does not modify configurations or execute their contents.
The evidence-only command needs Node alone and verifies all six source pins,
the retained input/download hashes, rejection of the old regions and correct
replay of the fixed regions.

## Limits

No real configurations, keys, model calls, MCP execution, effective-permission
or security-scanner claims. Initial app assets are fetched from the local
preview; analysis itself made no HTTP requests. GitHub code-scanning ingestion,
hosted CI, Firefox, WebKit and other SARIF consumers were NOT RUN. The consumer
replay is an offline contract check, not a claim of hosted acceptance. PR3's
broader download-evidence work and PR4's asynchronous file-input fix are not
changed or required by this PR. No issue is closed by this coordinate fix.
