# Exact numeric changes in unsupported fields

Base: `7555911a4990338791853c7f363c01941a2fd376`.

The fictional MCP configuration's unsupported `extension.revision` changes
from `9007199254740992` to `9007199254740993`. The base accepts both inputs,
converts both to the same JavaScript Number, reports no findings and exits 0
at the medium review threshold. The browser downloads that same no-change
report. The original declared decimal values are different.

This violates the project's stated comparison behavior: changed unsupported
fields should produce `UNMODELED_CHANGE`, with explicitly unknown impact.
[RFC 8259 section 6](https://www.rfc-editor.org/rfc/rfc8259.html#section-6)
describes decimal JSON numbers and the interoperability limits of binary64.
It permits implementations to limit numeric precision; it does not mandate
this comparison policy. Here an unsupported client's numeric interpretation
is unknown, so rounded equality should not conceal a declared change.

## Change

The parser retains numeric literals keyed by their existing JSON Pointer,
alongside its ordinary parsed data and locations. Only unsupported-field
comparison uses that metadata. A private decimal representation removes
leading/trailing coefficient zeroes and adjusts the base-10 exponent with
BigInt arithmetic. It does not calculate an enormous power or turn the
coefficient into a Number. Types are tagged internally to keep strings,
arrays, null and missing values distinct.

Equivalent values such as `1`, `1.0`, `1e0`, and differently written large
integers or subnormal decimals remain equal. Negative zero retains the
existing equality with zero. Known string fields still compare literally.
Existing input-size, depth, node, duplicate-key and nonfinite-Number rejection
rules remain in force. Numeric metadata and values are absent from reports;
the report schema, finding code, medium severity and default high gate remain
unchanged. This is not a client permission model or scanner claim.

This branch starts from main and includes none of pending #3/#4/#5/#6. It
does not change browser file-read ownership, newline evidence or PR link
mapping. `src/json.mjs` is also touched by #5/#6 and needs ordinary integration
review; this patch retains main's existing newline handling.

## Evidence

The identical final regression ran before and after the production change:

| Check | Base | Fixed |
| --- | --- | --- |
| Existing Node tests | 40 pass | 40 pass |
| New regression tests | 10 fail, 1 equivalence control passes | 11 pass |
| Full Node suite | 41/51 pass | 51/51 pass, no skips |
| Existing synthetic benchmark | 10/10 pass | 10/10 pass |
| Six actual-file CLI/browser workflows | 3 fail, 3 controls pass | 6 pass |

Direct numeric cases cover positive/negative integers, decimal precision,
underflow and large exponent spelling. Controls cover nine equivalent-number
pairs, JSON type distinctions, array order, object key order, escaped pointer
keys, literal modeled arguments, redaction, actual CLI exit thresholds and
native Git PR review with source links. The failed base redaction/evidence
test fails because its expected finding is absent; no value leak is alleged.

The browser uses the native File API and the real shared evaluator. Each
stage completes **18 downloads** (six JSON, six Markdown, six SARIF) and
**18 real CLI outputs**. Saved download bytes equal the visible fallback and
the CLI renderer after removing exactly its one `console.log` terminal LF.
The changed cases produce a medium finding and CLI exit 1 after the fix;
large-number and underflow aliases remain no-change controls. A number-to-string
change is an unchanged valid detection control. SARIF finding codes and
original source locations are checked. The underflow case also runs in Arabic.
No HTTP requests occur during analysis, and no response/File API/evaluator
mocks or configured command/MCP execution are used.

A separate Python `json.loads(parse_int=Decimal, parse_float=Decimal)`
comparison confirms exact equality/inequality for all six original input
pairs, independently of the product's normalization code.

[results.json](exact-numbers/results.json) contains the actual decoded JSON
reports, CLI statuses, browser observations, download digests, source hashes
and Decimal oracle labels. Four unmodified sample files retain the initial
reproduction: [before input](exact-numbers/before.json),
[after input](exact-numbers/after.json),
[baseline download](exact-numbers/baseline-report.json), and
[fixed download](exact-numbers/fixed-report.json).

## Reproduce

From the repository root with Node 22+:

```sh
node --test
node benchmark/run.mjs
node verification/numeric-evidence.mjs
git diff --check
```

The evidence verifier checks seven source pins, all four samples, and
reconstructs all 36 report download digests from the recorded reports. This
verifies packet integrity; rerun the actual workflow to reproduce execution.
With an existing Playwright/Chromium installation and Bun on PATH:

```sh
BUN=bun node verification/numeric-workflow.mjs /tmp/monna-numeric-fresh-run
```

The output directory must not already exist. The runner starts its own
`bun preview.mjs` on `127.0.0.1:8432`, refuses an occupied port, uses fresh
browser contexts, and closes its server/browser. It writes original inputs,
actual CLI outputs, completed download bytes and observations. To reproduce
the negative result in a disposable clean checkout, retain the final tests
and verification files but use main's `src/json.mjs` and `src/diff.mjs`.
The same workflow should report three failing cases and three passing controls.

Observed: macOS 15.7.7 arm64, Node 24.3.0, Bun 1.4.4,
Playwright 1.64.1, Chromium 156.0.8078.4, Python 3.12.10. No package changes
or installations. Hosted CI, SARIF ingestion, other browsers and effective
permission interpretation were **NOT RUN/claimed**. All evidence is fictional;
the benchmark is the existing ten authored fixtures, not an independent
performance or market result.
