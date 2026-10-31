export function markdown(r){
  const lines=['# MONNA Agent Permission Diff','',`**${r.verdict}** · ${r.format} · ${r.findings.length} findings`,'','| Rule | Severity | Before line | After line | Review |','|---|---|---:|---:|---|'];
  for(const f of r.findings)lines.push(`| ${f.code} | ${f.severity} | ${f.evidence.before.line} | ${f.evidence.after.line} | ${f.message} |`);
  if(!r.findings.length)lines.push('','No changes detected in the compared configuration fields.');
  lines.push('',`Coverage: ${r.coverage.status}. Unsupported fields: ${r.coverage.unsupported_fields.length}.`,'',...r.limitations.map(s=>'- '+s),'','Built by [MONNA](https://github.com/emanalshazly/monna-agent-permission-diff).');return lines.join('\n')+'\n';
}
export function sarif(r){
  const codes=[...new Set(r.findings.map(f=>f.code))];
  return {$schema:'https://json.schemastore.org/sarif-2.1.0.json',version:'2.1.0',runs:[{columnKind:'utf16CodeUnits',newlineSequences:['\r\n','\r','\n'],tool:{driver:{name:r.tool.name,version:r.tool.version,rules:codes.map(id=>({id,shortDescription:{text:id}}))}},results:r.findings.map(f=>({ruleId:f.code,level:f.severity==='info'?'note':f.severity==='medium'?'warning':'error',message:{text:f.message},locations:[{physicalLocation:{artifactLocation:{uri:'after.json'},region:{startLine:f.evidence.after.line,startColumn:f.evidence.after.column}}}],relatedLocations:[{id:1,message:{text:'Before configuration'},physicalLocation:{artifactLocation:{uri:'before.json'},region:{startLine:f.evidence.before.line,startColumn:f.evidence.before.column}}}]})),properties:{coverage:r.coverage.status,limitations:r.limitations}}]};
}
