// Optional real-browser check: requires an existing Playwright/Chromium install.
// Run with Node 22+ and BUN=/path/to/bun; writes only to a fresh output directory.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const repo=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(process.argv[2]??path.join(repo,'local-reports/coordinates'));
await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
const canary='PUBLIC_TEST_CANARY_DO_NOT_USE';
const render=(lines,separators)=>lines.map((line,i)=>line+(i<lines.length-1?separators[i%separators.length]:'')).join('');
const beforeLines=['{','  "permissions": {','    "allow": []','  }','}'];
const afterLines=['{','  "permissions": {','    "allow": [',`      "Read(./${canary}/**)"`,'    ]','  }','}'];
const scenarios=Object.entries({lf:['\n'],crlf:['\r\n'],cr:['\r'],mixed:['\r\n','\r','\n']}).map(([name,separators])=>({
  name,before:render(beforeLines,separators),after:render(afterLines,separators),code:'ALLOW_ADDED',
  expected:{before:{line:3,column:14},after:{line:4,column:7}},beforeToken:'[',afterToken:'"',
}));
const mcp=url=>JSON.stringify({mcpServers:{fictional:{url}}},null,2).replaceAll('\n','\r');
scenarios.push({name:'mcp-cr-ar',before:mcp(`https://before.example.invalid/${canary}`),after:mcp(`https://after.example.invalid/${canary}`),
  code:'ENDPOINT_CHANGED',expected:{before:{line:4,column:14},after:{line:4,column:14}},beforeToken:'"',afterToken:'"',arabic:true});
const before='{"note":"🚲","permissions":{"allow":[]}}';
const after=`{"note":"🚲","permissions":{"allow":["Read(./${canary}/**)"]}}`;
scenarios.push({name:'astral-single',before,after,code:'ALLOW_ADDED',
  expected:{before:{line:1,column:before.indexOf('[')+1},after:{line:1,column:after.indexOf('"Read(')+1}},beforeToken:'[',afterToken:'"'});

function point(text,region,run){
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const lines=text.split(new RegExp((run.newlineSequences??['\r\n','\n']).map(escape).join('|'),'g'));
  assert.ok(lines[region.startLine-1]!==undefined,'region points beyond the original file');
  return lines[region.startLine-1][region.startColumn-1];
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const server=spawn(process.env.BUN??'bun',['preview.mjs'],{cwd:repo,stdio:['ignore','pipe','pipe']});
let browser;const results=[];
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Owned preview did not start')),10000);
    server.once('error',reject);server.once('exit',code=>reject(Error('Owned preview exited '+code)));
    server.stdout.on('data',d=>{if(d.toString().includes('Permission Diff preview:')){clearTimeout(timer);resolve();}});
    server.stderr.on('data',d=>process.stderr.write(d));
  });
  browser=await chromium.launch({headless:true});
  for(const scenario of scenarios){
    const folder=path.join(output,scenario.name);await mkdir(folder);
    const errors=[],downloads=[],cli={};
    const check=(label,fn)=>{try{fn();}catch(e){errors.push(label+': '+e.message);}};
    for(const side of ['before','after']){
      JSON.parse(scenario[side]);await writeFile(path.join(folder,side+'.json'),scenario[side]);
    }
    for(const format of ['json','markdown','sarif']){
      const result=spawnSync(process.execPath,['cli.mjs',path.join(folder,'before.json'),path.join(folder,'after.json'),
        '--format',format,'--fail-on','none'],{cwd:repo,encoding:null,timeout:30000});
      assert.equal(result.status,0,result.stderr?.toString());
      cli[format]=result.stdout;await writeFile(path.join(folder,'cli.'+format),result.stdout);
    }
    const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
    let browserReport,browserSarif;const analysisRequests=[];
    try{
      await page.goto('http://127.0.0.1:8432');
      page.on('request',r=>{if(/^https?:/.test(r.url()))analysisRequests.push(r.url());});
      if(scenario.arabic)await page.locator('#lang').click();
      for(const side of ['before','after']){
        await page.locator(side==='before'?'#fileBefore':'#fileAfter').setInputFiles(path.join(folder,side+'.json'));
        await page.waitForFunction(({side,text})=>document.getElementById(side).value===text,
          {side,text:scenario[side].replace(/\r\n?/g,'\n')});
      }
      await page.locator('#compare').click();
      for(const [button,format] of [['json','json'],['md','markdown'],['sarif','sarif']]){
        const pending=page.waitForEvent('download');await page.locator('#'+button).click();const download=await pending;
        const file=path.join(folder,'browser.'+format);await download.saveAs(file);assert.equal(await download.failure(),null);
        const bytes=await readFile(file);assert.ok(bytes.length);assert.ok(!bytes.toString().includes(canary));
        assert.equal(bytes.toString(),await page.locator('#exportText').inputValue());
        // console.log adds exactly one terminal LF to the CLI renderer output.
        assert.equal(cli[format].at(-1),10);
        check(format+' CLI/browser bytes',()=>assert.deepEqual(bytes,cli[format].subarray(0,cli[format].length-1)));
        downloads.push({format,filename:download.suggestedFilename(),bytes:bytes.length,sha256:sha(bytes)});
        if(format==='json')browserReport=JSON.parse(bytes);
        if(format==='sarif')browserSarif=JSON.parse(bytes);
      }
      const expected=[{code:scenario.code,evidence:scenario.expected}];
      const coordinates=report=>report.findings.map(({code,evidence})=>({code,evidence}));
      check('CLI coordinates',()=>assert.deepEqual(coordinates(JSON.parse(cli.json)),expected));
      check('browser coordinates',()=>assert.deepEqual(coordinates(browserReport),expected));
      const run=browserSarif.runs[0],finding=run.results[0];
      check('SARIF after-source replay',()=>assert.equal(point(scenario.after,finding.locations[0].physicalLocation.region,run),scenario.afterToken));
      check('SARIF before-source replay',()=>assert.equal(point(scenario.before,finding.relatedLocations[0].physicalLocation.region,run),scenario.beforeToken));
      if(scenario.name==='astral-single')check('explicit column unit',()=>assert.equal(run.columnKind,'utf16CodeUnits'));
      assert.deepEqual(analysisRequests,[]);
      results.push({case:scenario.name,expected:scenario.expected,cli:coordinates(JSON.parse(cli.json)),browser:coordinates(browserReport),
        sarifCoordinates:{newlineSequences:run.newlineSequences??null,columnKind:run.columnKind??null},
        inputs:{beforeSha256:sha(scenario.before),afterSha256:sha(scenario.after)},analysisHttpRequests:analysisRequests,downloads,errors});
    }finally{await context.close();}
  }
}finally{await browser?.close();server.kill();}
await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
for(const result of results)console.log(result.case+': '+(result.errors.length?'FAIL '+result.errors.map(e=>e.split('\n')[0]).join('; '):'PASS'));
if(results.some(r=>r.errors.length))process.exitCode=1;
