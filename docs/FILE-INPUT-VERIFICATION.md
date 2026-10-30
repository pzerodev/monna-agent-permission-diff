# File-read ownership regression

Base: `7555911a4990338791853c7f363c01941a2fd376`. All inputs below are
fictional. This is a browser editor/report consistency defect, not a claim
about effective permissions or scanner coverage.

`File.arrayBuffer()` completes asynchronously. Previously its callback always
wrote to the editor, even if another file, a manual edit or the worked example
had replaced that input. An obsolete UTF-8 error also replaced the current
status. The late programmatic editor write did not fire an input event, so a
report could describe different text from the text currently visible.

For example, a delayed empty configuration can overwrite a later file after
that file was compared. Both visible editors then contain
`{"permissions":{}}`, while the downloadable report still has `ALLOW_ADDED`
at after-line 4. The fix gives each editor an independent revision. A file
completion or error applies only while its revision still owns that editor;
manual input and loading the example supersede pending reads.

## Dependency-free regression checks

```sh
node --test test/web-file-input.test.mjs
node --test
node benchmark/run.mjs
```

The new tests import the actual browser entry point with a small DOM fixture
and controlled read promises. Before the production edit, five of seven new
cases fail; independent before/after reads and a current invalid UTF-8 file
pass. Afterward all seven pass. The unchanged base passes 40 existing tests;
the final tree passes **47/47**, and all **10/10** authored benchmark fixtures
pass. These Node checks require no dependency installation.

## Native-file browser reproduction

Start `bun preview.mjs`, open `http://127.0.0.1:8432`, and prepare these two
fictional local files:

`held-after.json`:

```json
{"permissions":{}}
```

`latest.json`:

```json
{
 "permissions": {
  "allow": [
   "Read(./PUBLIC_TEST_CANARY_DO_NOT_USE/**)"
  ]
 }
}
```

Before selecting files, run this temporary delivery gate in the browser's
developer console. It reads real native File bytes and delays only delivery
of the first file's completed result; it does not supply replacement bytes.

```js
const nativeRead = File.prototype.arrayBuffer;
let releaseRead;
File.prototype.arrayBuffer = async function (...args) {
  const actualBytes = await nativeRead.apply(this, args);
  if (this.name === 'held-after.json') {
    await new Promise(resolve => { releaseRead = resolve; });
  }
  return actualBytes;
};
```

1. Paste `{"permissions":{}}` into the before editor.
2. Select `held-after.json` for the after editor. Wait until `releaseRead` is
   a function, then select `latest.json` for the same editor.
3. Wait for the latest text and compare. There is one `ALLOW_ADDED` finding.
4. Run `releaseRead()`. On the base, the after editor becomes empty permissions
   while the report still says one addition. With the fix, the latest editor
   text and report remain consistent.
5. Download Markdown and SARIF and inspect the completed files. They retain
   `ALLOW_ADDED`, before-line 1 and after-line 4; SARIF parses as version 2.1.0.
   Neither report contains `PUBLIC_TEST_CANARY_DO_NOT_USE`.
6. Restore `File.prototype.arrayBuffer = nativeRead`, or close the disposable
   page, after the check.

The same ordering gate can hold a read while typing in that editor or loading
the worked example. The new text must survive release. Holding native bytes
`c3 28` tests an obsolete invalid-UTF-8 completion: it must not replace a newer
valid comparison status. A current invalid file must still show its error.

## Executed browser evidence and limits

On macOS arm64, Node 24.3.0, Bun 1.4.4 and existing Playwright 1.64.1 Chromium,
five fresh browser contexts exercised latest-file selection, manual editing,
worked-example replacement, an obsolete UTF-8 error and normal independent
file loading. The same driver ran against the unchanged production source and
the fix: **four failures / one valid control passed before; five passed after**.

Each run saved and read **ten completed downloads** (Markdown and SARIF for
each flow). Checks covered nonempty bytes, exact equality with copyable text,
SARIF parsing and rule/source-line content, and absence of the public canary.
The fixed flows also matched the visible editor texts to the intended latest
inputs. Screenshots confirmed the original visible-input/report mismatch.

The automated browser driver used an external cached development runtime; it
does not add a package, lockfile, browser-test command or dependency on the
separate export-evidence PR. The manual steps above reproduce the ordering
without that driver. The delivery gate makes ordering deterministic; natural
race frequency is not measured. Other browsers, hosted deployment, GitHub
SARIF ingestion and effective permissions are unverified. No configuration
was uploaded, configured command executed, model called or paid service used.
