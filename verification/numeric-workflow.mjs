// Optional browser evidence using an existing Playwright/Chromium installation.
// Run from any directory with BUN=/path/to/bun and a fresh output directory.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {canary,document,browserCases} from './numeric-fixtures.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const repo=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(process.argv[2]??path.join(repo,'local-reports/numeric'));
await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
const sha=x=>createHash('sha256').update(x).digest('hex');
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
  for(const example of browserCases){
    const folder=path.join(output,example.name);await mkdir(folder);
    const before=document(example.before,example),after=document(example.after,example);
    const errors=[],downloads=[],cli={},commands={};
    const check=(label,fn)=>{try{fn();}catch(e){errors.push(label+': '+e.message);}};
    for(const [side,text] of [['before',before],['after',after]]){
      await writeFile(path.join(folder,side+'.json'),text);JSON.parse(text);
    }
    for(const format of ['json','markdown','sarif']){
      const args=['cli.mjs',path.join(folder,'before.json'),path.join(folder,'after.json'),
        '--format',format,'--fail-on','medium'];
      const result=spawnSync(process.execPath,args,{cwd:repo,encoding:null,timeout:30000});
      assert.ok([0,1].includes(result.status),result.stderr?.toString());
      cli[format]=result.stdout;commands[format]={exitCode:result.status,stderr:result.stderr.toString()};
      await writeFile(path.join(folder,'cli.'+format),result.stdout);
      check(format+' CLI medium gate',()=>assert.equal(result.status,example.equal?0:1));
    }
    const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
    const analysisHttpRequests=[];let report,sarifReport;
    try{
      await page.goto('http://127.0.0.1:8432');
      page.on('request',r=>{if(/^https?:/.test(r.url()))analysisHttpRequests.push(r.url());});
      if(example.name==='underflow')await page.locator('#lang').click();
      for(const [side,text] of [['before',before],['after',after]]){
        await page.locator(side==='before'?'#fileBefore':'#fileAfter').setInputFiles(path.join(folder,side+'.json'));
        await page.waitForFunction(({side,text})=>document.getElementById(side).value===text,{side,text});
      }
      await page.locator('#compare').click();
      const status=await page.locator('#status').textContent();
      for(const [button,format] of [['json','json'],['md','markdown'],['sarif','sarif']]){
        const pending=page.waitForEvent('download');await page.locator('#'+button).click();
        const download=await pending;const file=path.join(folder,'browser.'+format);
        await download.saveAs(file);assert.equal(await download.failure(),null);
        const bytes=await readFile(file);assert.ok(bytes.length);
        assert.equal(bytes.toString(),await page.locator('#exportText').inputValue());
        assert.equal(bytes.toString().includes(canary),false);
        assert.equal(bytes.toString().includes('numberLiterals'),false);
        assert.equal(cli[format].at(-1),10);
        check(format+' CLI/download bytes',()=>assert.deepEqual(bytes,cli[format].subarray(0,-1)));
        downloads.push({format,filename:download.suggestedFilename(),bytes:bytes.length,sha256:sha(bytes)});
        if(format==='json')report=JSON.parse(bytes);
        if(format==='sarif')sarifReport=JSON.parse(bytes);
      }
      const expected=example.equal?[]:['UNMODELED_CHANGE'];
      check('JSON finding codes',()=>assert.deepEqual(report.findings.map(f=>f.code),expected));
      check('SARIF finding codes',()=>assert.deepEqual(sarifReport.runs[0].results.map(f=>f.ruleId),expected));
      if(!example.equal){
        const finding=sarifReport.runs[0].results[0];
        if(finding){
          for(const [text,location] of [[after,finding.locations[0]],[before,finding.relatedLocations[0]]]){
            const region=location.physicalLocation.region;
            check('SARIF original-source evidence',()=>assert.equal(text.split('\n')[region.startLine-1][region.startColumn-1],'{'));
          }
        }
      }
      assert.deepEqual(analysisHttpRequests,[]);
      results.push({case:example.name,expectedCodes:expected,cli:commands,browserStatus:status,
        actualCodes:report.findings.map(f=>f.code),evidence:report.findings.map(f=>f.evidence),
        coverage:report.coverage.status,inputs:{beforeSha256:sha(before),afterSha256:sha(after)},
        analysisHttpRequests,downloads,errors});
    }finally{await context.close();}
  }
  await writeFile(path.join(output,'runtime.json'),JSON.stringify({node:process.version,chromium:browser.version()},null,2)+'\n');
}finally{await browser?.close();server.kill();}
await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
for(const result of results)console.log(result.case+': '+(result.errors.length?'FAIL '+result.errors.map(e=>e.split('\n')[0]).join('; '):'PASS'));
if(results.some(r=>r.errors.length))process.exitCode=1;
