// Replay the retained real download against its original fictional CR-only files.
// This requires only Node, not Playwright or the application being served.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),folder=new URL('docs/verification/source-coordinates/',root);
const read=file=>readFileSync(new URL(file,folder));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence=JSON.parse(read('results.json')),cr=evidence.cases.find(x=>x.case==='cr');
for(const [file,digest] of Object.entries(evidence.sourceSha256))assert.equal(sha(readFileSync(new URL(file,root))),digest,file);
const sources={before:read('cr/before.json').toString(),after:read('cr/after.json').toString()};
for(const side of ['before','after'])assert.equal(sha(sources[side]),cr.inputs[side+'Sha256']);
const baseline=read('cr/baseline.sarif'),fixed=read('cr/fixed.sarif');
assert.equal(sha(baseline),cr.before.downloads.find(x=>x.format==='sarif').sha256);
assert.equal(sha(fixed),cr.after.downloads.find(x=>x.format==='sarif').sha256);
function point(text,region,run){
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const line=text.split(new RegExp((run.newlineSequences??['\r\n','\n']).map(escape).join('|'),'g'))[region.startLine-1];
  assert.notEqual(line,undefined,'region points beyond the original file');
  assert.equal(run.columnKind,'utf16CodeUnits');return line[region.startColumn-1];
}
const oldRun=JSON.parse(baseline).runs[0],newRun=JSON.parse(fixed).runs[0];
for(const [side,location,token] of [['before','relatedLocations','['],['after','locations','"']]){
  assert.throws(()=>point(sources[side],oldRun.results[0][location][0].physicalLocation.region,oldRun),/beyond the original file/);
  assert.equal(point(sources[side],newRun.results[0][location][0].physicalLocation.region,newRun),token);
}
assert.deepEqual(newRun.newlineSequences,['\r\n','\r','\n']);
console.log(`${Object.keys(evidence.sourceSha256).length} source pins and actual download/source hashes match; baseline regions fail replay; fixed regions point to the original tokens.`);
