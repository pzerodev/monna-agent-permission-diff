import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compare,shouldFail} from '../src/diff.mjs';
import {markdown,sarif} from '../src/report.mjs';
import {reviewPR,prMarkdown} from '../src/pr-review.mjs';
import {canary,document,changes,equivalents} from '../verification/numeric-fixtures.mjs';

for(const example of changes)test('unknown numeric change remains visible: '+example.name,()=>{
  assert.equal(Number(example.before),Number(example.after),'the fixture must exercise the binary64 collision');
  const report=compare(document(example.before,example),document(example.after,example));
  assert.equal(report.coverage.status,'partial');
  assert.deepEqual(report.findings.map(f=>f.code),['UNMODELED_CHANGE']);
  assert.equal(shouldFail(report,'medium'),true);
  assert.equal(shouldFail(report,'high'),false);
});

test('equivalent exact decimal spellings do not create changes',()=>{
  for(const [a,b] of equivalents){
    const report=compare(document(a),document(b));
    assert.equal(report.findings.length,0,a+' and '+b);
    assert.equal(report.coverage.status,'partial');
  }
});

test('numeric comparison preserves JSON types, array order and escaped-key paths',()=>{
  for(const value of ['"1"','["number","1e0"]','null','{"number":"1e0"}'])
    assert.equal(compare(document('1'),document(value)).findings[0].code,'UNMODELED_CHANGE');
  const a='{"permissions":{},"future":{"a/b~c":[9007199254740992,1],"z":true}}';
  const b='{"future":{"z":true,"a/b~c":[9007199254740993,1]},"permissions":{}}';
  assert.equal(compare(a,b).findings.length,1);
  assert.equal(compare(a,b.replace('9007199254740993','90071992547409920e-1')).findings.length,0);
  assert.equal(compare(document('[1,2]'),document('[2,1]')).findings.length,1);
  assert.equal(compare(document('1'),document('"1.0"')).findings.length,1);
  // Modeled strings are still literal, including numeric-looking arguments.
  const m=args=>JSON.stringify({mcpServers:{fictional:{args}}});
  assert.equal(compare(m(['1']),m(['1.0'])).findings[0].code,'ARGUMENTS_CHANGED');
});

test('exact-number metadata and input canaries never appear in reports',()=>{
  const report=compare(document(changes[0].before),document(changes[0].after));
  assert.equal(report.findings[0].evidence.before.line,5);
  assert.equal(report.findings[0].evidence.after.line,5);
  for(const out of [JSON.stringify(report),markdown(report),JSON.stringify(sarif(report))]){
    for(const value of [canary,changes[0].before,changes[0].after,'numberLiterals'])assert.equal(out.includes(value),false);
  }
});

test('real CLI files fail the medium gate and keep valid numeric aliases below it',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'monna-exact-numeric-cli-'));
  try{
    const before=join(cwd,'before.json'),after=join(cwd,'after.json');
    writeFileSync(before,document(changes[0].before));writeFileSync(after,document(changes[0].after));
    const run=threshold=>spawnSync(process.execPath,[resolve('cli.mjs'),before,after,'--fail-on',threshold],{encoding:'utf8'});
    const changed=run('medium');assert.equal(changed.status,1,changed.stderr);
    assert.deepEqual(JSON.parse(changed.stdout).findings.map(f=>f.code),['UNMODELED_CHANGE']);
    assert.equal(run('high').status,0);
    writeFileSync(after,document('90071992547409920e-1'));
    const unchanged=run('medium');assert.equal(unchanged.status,0,unchanged.stderr);
    assert.equal(JSON.parse(unchanged.stdout).findings.length,0);
  }finally{rmSync(cwd,{recursive:true,force:true});}
});

test('native Git PR review retains exact numeric changes and source links',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'monna-exact-numeric-git-'));
  const git=(...args)=>{
    const r=spawnSync('git',['-c','user.name=Fictional Test','-c','user.email=fixture@example.invalid',
      '-c','commit.gpgsign=false',...args],{cwd,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);return r.stdout.trim();
  };
  try{
    git('init','--initial-branch=main');
    const commit=value=>{writeFileSync(join(cwd,'.mcp.json'),document(value));git('add','.mcp.json');git('commit','-m','fictional numeric fixture');return git('rev-parse','HEAD');};
    const base=commit(changes[0].before),head=commit(changes[0].after);
    const options={cwd,base,head,repository:'fictional/numeric-review',threshold:'medium'};
    const result=reviewPR(options);assert.equal(result.exitCode,1);assert.equal(result.findings,1);
    assert.ok(prMarkdown(result).includes(`/blob/${head}/.mcp.json#L5`));
    assert.equal(prMarkdown(result).includes(canary),false);
    const alias=commit('90071992547409920e-1');
    const unchanged=reviewPR({...options,head:alias});assert.equal(unchanged.exitCode,0);assert.equal(unchanged.findings,0);
  }finally{rmSync(cwd,{recursive:true,force:true});}
});
