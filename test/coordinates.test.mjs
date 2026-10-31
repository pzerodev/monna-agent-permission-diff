import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compare} from '../src/diff.mjs';
import {parseConfig} from '../src/json.mjs';
import {sarif} from '../src/report.mjs';

const folder=mkdtempSync(join(tmpdir(),'monna-coordinates-'));
test.after(()=>rmSync(folder,{recursive:true,force:true}));
const canary='PUBLIC_TEST_CANARY_DO_NOT_USE';
const beforeLines=['{','  "permissions": {','    "allow": []','  }','}'];
const afterLines=['{','  "permissions": {','    "allow": [',`      "Read(./${canary}/**)"`,'    ]','  }','}'];
const separators={LF:['\n'],CRLF:['\r\n'],CR:['\r'],mixed:['\r\n','\r','\n']};
const render=(lines,breaks)=>lines.map((line,i)=>line+(i<lines.length-1?breaks[i%breaks.length]:'')).join('');

function cli(before,after,format,name){
  const a=join(folder,name+'-before.json'),b=join(folder,name+'-after.json');
  writeFileSync(a,before);writeFileSync(b,after);
  const result=spawnSync(process.execPath,[resolve('cli.mjs'),a,b,'--format',format,'--fail-on','none'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.ok(!result.stdout.includes(canary));
  return result.stdout;
}

// Replay line coordinates as a SARIF consumer, using the report's declared
// separators (or the standard defaults), independently of the JSON parser.
function pointedCharacter(text,region,run){
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp((run.newlineSequences??['\r\n','\n']).map(escape).join('|'),'g');
  const line=text.split(pattern)[region.startLine-1];
  assert.notEqual(line,undefined,'SARIF points beyond the original file');
  return line[region.startColumn-1];
}

for(const [name,breaks] of Object.entries(separators)){
  test(`${name} files preserve source evidence through the CLI's three formats`,()=>{
    const before=render(beforeLines,breaks),after=render(afterLines,breaks);
    const report=JSON.parse(cli(before,after,'json',name));
    assert.deepEqual(report,compare(before,after));
    assert.deepEqual(report.findings.map(f=>[f.code,f.evidence]),[
      ['ALLOW_ADDED',{before:{line:3,column:14},after:{line:4,column:7}}],
    ]);
    const md=cli(before,after,'markdown',name);
    assert.match(md,/\| ALLOW_ADDED \| high \| 3 \| 4 \|/);
    const run=JSON.parse(cli(before,after,'sarif',name)).runs[0],finding=run.results[0];
    assert.equal(pointedCharacter(after,finding.locations[0].physicalLocation.region,run),'"');
    assert.equal(pointedCharacter(before,finding.relatedLocations[0].physicalLocation.region,run),'[');
  });
}

test('SARIF declares the parser line breaks and UTF-16 columns for an astral prefix',()=>{
  const before='{"note":"🚲","permissions":{"allow":[]}}';
  const after=`{"note":"🚲","permissions":{"allow":["Read(./${canary}/**)"]}}`;
  const report=compare(before,after),run=sarif(report).runs[0];
  assert.equal(report.findings[0].evidence.after.column,after.indexOf('"Read(')+1);
  assert.equal(report.findings[0].evidence.after.column,[...after.slice(0,after.indexOf('"Read('))].length+2);
  assert.equal(run.columnKind,'utf16CodeUnits');
  assert.deepEqual(run.newlineSequences,['\r\n','\r','\n']);
  assert.equal(pointedCharacter(after,run.results[0].locations[0].physicalLocation.region,run),'"');
});

test('duplicate-key diagnostics use the same physical lines without echoing input',()=>{
  for(const breaks of Object.values(separators)){
    assert.throws(()=>parseConfig(render(['{',`  "${canary}": 0,`,`  "${canary}": 1`,'}'],breaks)),error=>{
      assert.match(error.message,/Duplicate object key at line 3, column/);
      assert.ok(!error.message.includes(canary));return true;
    });
  }
});

test('escaped control characters remain string data, not source line breaks',()=>{
  const before='{"permissions":{"allow":["Read(./line\\r/**)"]}}';
  const after='{"permissions":{"allow":["Read(./line\\n/**)"]}}';
  const report=compare(before,after);
  assert.deepEqual(report.findings.map(f=>f.code),['ALLOW_ADDED','ALLOW_REMOVED']);
  for(const finding of report.findings){
    assert.equal(finding.evidence.before.line,1);assert.equal(finding.evidence.after.line,1);
  }
});
