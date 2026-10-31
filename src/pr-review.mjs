import {spawnSync} from 'node:child_process';
import {compare,shouldFail} from './diff.mjs';

const shaPattern=/^[a-f0-9]{40}$/;
const supported=path=>/(^|\/)\.claude\/settings(?:\.local)?\.json$/.test(path)?'claude-settings':/(^|\/)(\.mcp\.json|\.cursor\/mcp\.json)$/.test(path)?'mcp':null;
const unsupported=path=>/(^|\/)(\.codex\/config\.toml|\.vscode\/mcp\.json|\.claude\/settings(?:\.local)?\.jsonc)$/.test(path);
function git(cwd,args,maxBuffer=4000000){
 const r=spawnSync('git',['--no-pager','--literal-pathspecs',...args],{cwd,encoding:null,timeout:20000,maxBuffer,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'}});
 if(r.status!==0||r.error)throw Error('Git objects unavailable or repository limit exceeded. Fetch full PR history and retry.');
 return new TextDecoder('utf-8',{fatal:true}).decode(r.stdout);
}
function blob(cwd,revision,path){
 const entry=git(cwd,['ls-tree','-z',revision,'--',path]).split('\0').filter(Boolean);
 if(!entry.length)return null;
 if(entry.length!==1)throw Error('Ambiguous tree entry.');
 const match=/^(100644|100755) blob ([a-f0-9]{40})\t/.exec(entry[0]);
 if(!match)throw Error('Configuration is not a regular Git blob.');
 const size=Number(git(cwd,['cat-file','-s',match[2]]).trim());
 if(!Number.isSafeInteger(size)||size>2000000)throw Error('Configuration exceeds the file limit.');
 return git(cwd,['cat-file','blob',match[2]],2000001);
}
// Git/GitHub blob line anchors advance on LF; text editors and our generic
// reports also recognize lone CR. Keep only the requested line translations,
// never source text, in the PR-specific link evidence.
function githubLines(text,requested){
 const wanted=new Set(requested),lines=new Map([[1,1]]);let sourceLine=1,gitLine=1;
 for(let i=0;i<text.length;i++){
  if(text[i]==='\r'){
   if(text[i+1]==='\n'){i++;gitLine++;}
   sourceLine++;
  }else if(text[i]==='\n'){sourceLine++;gitLine++;}
  else continue;
  if(wanted.has(sourceLine))lines.set(sourceLine,gitLine);
 }
 return requested.map(line=>lines.get(line));
}
export function reviewPR({cwd,base,head,repository,threshold='medium'}){
 if(!shaPattern.test(base)||!shaPattern.test(head)||!/^[-\w.]+\/[-\w.]+$/.test(repository))throw Error('Invalid commit or repository identity.');
 shouldFail({findings:[]},threshold);
 const bases=git(cwd,['merge-base','--all',base,head]).trim().split(/\s+/);
 if(bases.length!==1||!shaPattern.test(bases[0]))throw Error('PR does not have one unambiguous merge base.');
 const mergeBase=bases[0];
 const changed=git(cwd,['diff','--no-ext-diff','--no-textconv','--no-renames','--name-only','-z',mergeBase,head,'--']).split('\0').filter(Boolean);
 const paths=changed.filter(p=>supported(p)||unsupported(p));
 if(paths.length>100)throw Error('More than 100 configuration files changed; split the review.');
 const files=paths.map(path=>{
  const format=supported(path);
  if(!format)return {path,status:'unsupported',reason:'Recognized configuration format is not supported. Review this file manually.'};
  try{
   const before=blob(cwd,mergeBase,path),after=blob(cwd,head,path);
   const empty=format==='mcp'?' {"mcpServers":{}} ':'{}';
   const report=compare(before??empty,after??empty,{format});
   const beforeLines=githubLines(before??empty,report.findings.map(f=>f.evidence.before.line));
   const afterLines=githubLines(after??empty,report.findings.map(f=>f.evidence.after.line));
   const githubEvidence=report.findings.map((_,i)=>({before:beforeLines[i],after:afterLines[i]}));
   return {path,status:'compared',beforePresent:before!==null,afterPresent:after!==null,report,githubEvidence};
  }catch{return {path,status:'error',reason:'Configuration could not be compared: invalid JSON, unsupported Git entry, unavailable object or input limit. Review manually; no clean result is claimed.'};}
 });
 const incomplete=files.some(f=>f.status!=='compared');
 const fail=files.some(f=>f.report&&shouldFail(f.report,threshold));
 const findings=files.reduce((n,f)=>n+(f.report?.findings.length??0),0);
 return {schema_version:'pr-review-1',repository,base,mergeBase,head,threshold,changedFileCount:changed.length,files,findings,
  verdict:incomplete?'incomplete':fail?'review_required':files.length?'below_review_threshold':'no_supported_config_changes',exitCode:incomplete?2:fail?1:0};
}
const actions={
 ALLOW_ADDED:['An additional allow rule may broaden authority.','Confirm the task needs this grant; narrow the rule before merging if not.'],
 DENY_REMOVED:['A previously declared prohibition was removed.','Restore the deny rule unless its removal is intentional and approved.'],
 ASK_REMOVED:['A declared human-approval checkpoint was removed.','Restore approval or document why unattended execution is acceptable.'],
 MODE_CHANGED:['The default approval mode changed; bypass mode can remove prompts.','Check the new mode and managed policy; require explicit owner approval for bypass.'],
 DIRECTORY_ADDED:['An additional directory entry may extend accessible scope.','Confirm ownership and necessity; prefer the narrowest directory.'],
 SERVER_ADDED:['A new MCP server configuration introduces another execution or remote-service boundary.','Verify the server source, version and required permissions before enabling it.'],
 COMMAND_CHANGED:['The configured executable changed.','Verify provenance and pin the intended executable; do not run it just to review this PR.'],
 ARGUMENTS_CHANGED:['Arguments can change executable behavior or access scope.','Inspect argument order and scope; reject unexplained execution or directory changes.'],
 ENDPOINT_CHANGED:['The remote service or routing target changed.','Verify destination ownership and authorization before sending data.'],
 ENVIRONMENT_CHANGED:['Environment changes can change identity, credentials or runtime behavior.','Review values privately; verify credential scope and avoid copying them into PR comments.'],
 HEADERS_CHANGED:['Headers can change the identity sent to the remote server.','Confirm the intended authentication scope privately.'],
 TRANSPORT_CHANGED:['Transport changes can alter connection and trust assumptions.','Confirm client support and the intended authenticated transport.'],
 ENABLEMENT_CHANGED:['A server enablement flag changed.','Verify client semantics and whether enabling or disabling the server is intentional.'],
 UNMODELED_CHANGE:['An unmodeled field changed; its security impact is unknown.','Inspect provider documentation and the source diff; obtain manual review.'],
};
const reduction=['ALLOW_REMOVED','DENY_ADDED','ASK_ADDED','DIRECTORY_REMOVED','SERVER_REMOVED'];
export function advice(code){return actions[code]??(reduction.includes(code)?['This is a potentially more restrictive declared configuration.','Confirm required workflows still work; other configuration layers may override this change.']:['A declared configuration field changed.','Inspect the source and confirm the change is intentional.']);}
export function prMarkdown(result){
 const encode=part=>encodeURIComponent(part).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 const url=(sha,path,line)=>`https://github.com/${result.repository}/blob/${sha}/${path.split('/').map(encode).join('/')}#L${line}`;
 const lines=['# MONNA — Agent permission PR review','',`**${result.verdict}** · ${result.files.length} configuration files · ${result.findings} findings`,
 '',`Compared merge base \`${result.mergeBase}\` to PR head \`${result.head}\`.`,
 '',`Gate threshold: ${result.threshold}. This gate does not establish runtime safety.`,
 '', 'Configuration values are omitted. Source links intentionally identify repository files and lines.'];
 if(!result.files.length)lines.push('','No recognized configuration changes found. Other agent configurations and runtime behavior were not assessed.');
 result.files.forEach((file,i)=>{
  lines.push('',`## File ${i+1}`,`[Source file](${url(file.afterPresent===false?result.mergeBase:result.head,file.path,1)})`);
  if(file.status!=='compared'){lines.push('',`**Manual review required:** ${file.reason}`);return;}
  lines.push('',`Coverage: ${file.report.coverage.status}.`);
  if(!file.report.findings.length)lines.push('No declared changes in compared fields.');
  for(const [index,f] of file.report.findings.entries()){
   const [why,action]=advice(f.code);
   const beforeLine=file.githubEvidence?.[index]?.before??f.evidence.before.line;
   const afterLine=file.githubEvidence?.[index]?.after??f.evidence.after.line;
   const before=file.beforePresent?`[Before L${beforeLine}](${url(result.mergeBase,file.path,beforeLine)})`:'Before: file absent (synthetic empty baseline)';
   const after=file.afterPresent?`[After L${afterLine}](${url(result.head,file.path,afterLine)})`:'After: file removed (synthetic empty state)';
   lines.push('',`### ${f.severity.toUpperCase()} · ${f.code}`,`${before} → ${after}`,'',`Why review: ${why}`,'',`Action: ${action}`);
  }
 });
 lines.push('','## Boundaries','No PR code, agent, MCP server or configuration command was executed by this reviewer. No files were rewritten. This is a static declared-change review, not effective-policy merging or a vulnerability verdict. Renames are reviewed as deletion plus addition. Unsupported recognized formats and read errors fail the gate as incomplete.');
 return lines.join('\n')+'\n';
}
