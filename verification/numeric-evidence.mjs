// Verify the committed evidence bytes; this does not replace rerunning workflows.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {markdown,sarif} from '../src/report.mjs';
import {browserCases,document,canary} from './numeric-fixtures.mjs';
const repo=new URL('..',import.meta.url);
const packet=new URL('docs/verification/exact-numbers/',repo);
const evidence=JSON.parse(await readFile(new URL('results.json',packet),'utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
for(const [name,hash] of Object.entries(evidence.sourceSha256))assert.equal(sha(await readFile(new URL(name,repo))),hash,name);
for(const [name,hash] of Object.entries(evidence.samples))assert.equal(sha(await readFile(new URL(name,packet))),hash,name);
for(const [stage,run] of Object.entries(evidence.runs)){
  assert.equal(run.browser.length,6);assert.equal(run.benchmark.passed,10);
  let failed=0,downloads=0;
  for(const result of run.browser){
    const fixture=browserCases.find(c=>c.name===result.case);
    for(const side of ['before','after'])assert.equal(sha(document(fixture[side],fixture)),result.inputs[side+'Sha256']);
    const equal=evidence.oracle.cases.find(c=>c.case===result.case).exactEqual;
    assert.equal(equal,!!fixture.equal);
    const expected=stage==='before'&&['positive-integer','decimal-tail','underflow'].includes(result.case)?[]:equal?[]:['UNMODELED_CHANGE'];
    assert.deepEqual(result.report.findings.map(f=>f.code),expected);
    assert.deepEqual(result.analysisHttpRequests,[]);
    if(result.errors.length)failed++;
    const outputs={json:JSON.stringify(result.report,null,2),markdown:markdown(result.report),sarif:JSON.stringify(sarif(result.report),null,2)};
    for(const file of result.downloads){
      const text=outputs[file.format];assert.equal(sha(text),file.sha256);assert.equal(Buffer.byteLength(text),file.bytes);
      assert.equal(text.includes(canary),false);assert.equal(text.includes('numberLiterals'),false);downloads++;
    }
    for(const command of Object.values(result.cli))assert.equal(command.exitCode,expected.length?1:0);
  }
  assert.equal(downloads,18);assert.equal(failed,stage==='before'?3:0);
  assert.equal(run.node.tests,51);assert.equal(run.node.fail,stage==='before'?10:0);
}
console.log('PASS: source/sample hashes, independent oracle labels, 36 completed-download digests, CLI gates and before/after evidence.');
