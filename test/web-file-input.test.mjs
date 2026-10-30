import test from 'node:test';
import assert from 'node:assert/strict';

// Dependency-free DOM fixture for the real web entry point. Browser evidence
// separately uses actual File bytes and completed downloads.
let instance = 0;
async function ui(t) {
  const element = () => ({value:'',textContent:'',disabled:false,hidden:false,files:[],children:[],
    replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},
    appendChild(node){this.children.push(node);}});
  const ids = Object.fromEntries(['before','after','fileBefore','fileAfter','status','findings',
    'exportText','exportPreview','json','md','sarif','lang','sample','format','compare'].map(id=>[id,element()]));
  ids.format.value='auto';
  const ready=element();ready.dataset={t:'ready'};ready.textContent='Ready for fictional inputs.';
  const previous=globalThis.document;
  globalThis.document={getElementById:id=>ids[id],querySelectorAll:()=>[ready],
    createElement:element,documentElement:{}};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  await import(`../web.mjs?file-input-test=${++instance}`);
  return ids;
}
const base='{"permissions":{}}';
const latest='{\n "permissions": {\n  "allow": [\n   "Read(./fictional-docs/**)"\n  ]\n }\n}';
function pending(bytes) {
  let resolve;
  const gate=new Promise(done=>{resolve=done;});
  const data=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;
  return {file:{size:data.byteLength,arrayBuffer:async()=>{await gate;return data.slice().buffer;}},resolve};
}
function select(page,side,file) {page[side==='before'?'fileBefore':'fileAfter'].files=file?[file]:[];return page[side==='before'?'fileBefore':'fileAfter'].onchange();}
function type(page,side,text) {page[side].value=text;page[side].oninput();}

test('an older file completion cannot replace the latest file selection',async t=>{
  const page=await ui(t),old=pending(base),next=pending(latest);
  const first=select(page,'after',old.file),second=select(page,'after',next.file);
  next.resolve();await second;
  type(page,'before',base);page.compare.onclick();const status=page.status.textContent;
  assert.match(status,/1 changes/);
  old.resolve();await first;
  assert.equal(page.after.value,latest);
  assert.equal(page.status.textContent,status);
});

test('typing into an editor supersedes its pending file read',async t=>{
  const page=await ui(t),old=pending(base),read=select(page,'before',old.file);
  type(page,'before',latest);
  old.resolve();await read;
  assert.equal(page.before.value,latest);
});

test('loading the sample supersedes pending reads in both editors',async t=>{
  const page=await ui(t),before=pending(base),after=pending(base);
  const a=select(page,'before',before.file),b=select(page,'after',after.file);
  page.sample.onclick();const expected=[page.before.value,page.after.value];
  before.resolve();after.resolve();await Promise.all([a,b]);
  assert.deepEqual([page.before.value,page.after.value],expected);
  page.compare.onclick();assert.match(page.status.textContent,/6 changes/);
});

test('an obsolete UTF-8 failure cannot replace the latest comparison status',async t=>{
  const page=await ui(t),old=pending(new Uint8Array([0xc3,0x28])),next=pending(latest);
  const a=select(page,'after',old.file),b=select(page,'after',next.file);
  next.resolve();await b;type(page,'before',base);page.compare.onclick();
  const status=page.status.textContent;assert.match(status,/1 changes/);
  old.resolve();await a;
  assert.equal(page.status.textContent,status);
  assert.equal(page.after.value,latest);
});

test('an empty new file selection supersedes an earlier pending read',async t=>{
  const page=await ui(t),old=pending(latest),read=select(page,'after',old.file);
  await select(page,'after',null);old.resolve();await read;
  assert.equal(page.after.value,'');
});

test('independent before and after file reads both complete normally',async t=>{
  const page=await ui(t),before=pending(base),after=pending(latest);
  const a=select(page,'before',before.file),b=select(page,'after',after.file);
  after.resolve();await b;before.resolve();await a;
  assert.deepEqual([page.before.value,page.after.value],[base,latest]);
  page.compare.onclick();assert.match(page.status.textContent,/1 changes/);
  assert.equal(page.md.disabled,false);
});

test('the current invalid UTF-8 file still clears exports and reports its error',async t=>{
  const page=await ui(t);page.sample.onclick();page.compare.onclick();
  assert.equal(page.md.disabled,false);
  const invalid=pending(new Uint8Array([0xc3,0x28])),read=select(page,'after',invalid.file);
  invalid.resolve();await read;
  assert.equal(page.after.value,'');assert.equal(page.md.disabled,true);
  assert.equal(page.status.textContent,'File must contain valid UTF-8 JSON.');
});
