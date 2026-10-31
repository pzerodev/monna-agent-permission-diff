import { parseConfig, ConfigError } from './json.mjs';
export const VERSION='0.1.0';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const esc=k=>k.replaceAll('~','~0').replaceAll('/','~1');
// Compare unsupported numeric fields as exact decimal values, not as their
// rounded JavaScript Number. Strip only mathematically irrelevant zeroes.
function decimal(literal){
  const [,sign,integer,fraction='',exponent='0']=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal);
  const digits=(integer+fraction).replace(/^0+/,'');
  if(!digits)return '0';
  const coefficient=digits.replace(/0+$/,'');
  const power=BigInt(exponent)-BigInt(fraction.length)+BigInt(digits.length-coefficient.length);
  return sign+coefficient+'e'+power;
}
function exact(value,pointer,numbers){
  if(typeof value==='number')return ['number',decimal(numbers.get(pointer))];
  if(Array.isArray(value))return ['array',value.map((v,i)=>exact(v,pointer+'/'+i,numbers))];
  if(object(value))return ['object',Object.keys(value).sort().map(k=>[k,exact(value[k],pointer+'/'+esc(k),numbers)])];
  // Tag every kind so a source string/array cannot collide with a number's
  // private comparison representation. Missing and null also stay distinct.
  return [typeof value,value];
}
function validate(c,format){
  const obj=(v)=>{if(!object(v))throw new ConfigError('Expected an object in a supported configuration field.');};
  const arr=(v)=>{if(!Array.isArray(v)||v.some(s=>typeof s!=='string'))throw new ConfigError('Expected a string array in a supported configuration field.');};
  if(format==='claude-settings'&&c.permissions!==undefined){obj(c.permissions);for(const k of ['allow','ask','deny','additionalDirectories'])if(c.permissions[k]!==undefined)arr(c.permissions[k]);if(c.permissions.defaultMode!==undefined&&typeof c.permissions.defaultMode!=='string')throw new ConfigError('Permission mode must be a string.');}
  if(format==='mcp'){
    if(c.mcpServers===undefined)throw new ConfigError('MCP format requires mcpServers, including for an empty baseline.');obj(c.mcpServers);
    for(const s of Object.values(c.mcpServers)){
      obj(s);for(const k of ['command','url','type'])if(s[k]!==undefined&&typeof s[k]!=='string')throw new ConfigError('MCP command, URL and type must be strings.');
      if(s.args!==undefined)arr(s.args);for(const k of ['env','headers'])if(s[k]!==undefined){obj(s[k]);if(Object.values(s[k]).some(x=>typeof x!=='string'))throw new ConfigError('MCP environment and header values must be strings.');}
      if(s.disabled!==undefined&&typeof s.disabled!=='boolean')throw new ConfigError('MCP disabled must be a boolean.');
    }
  }
}
export function compare(beforeText,afterText,{format='auto'}={}){
  const before=parseConfig(beforeText),after=parseConfig(afterText);
  if(format==='auto'){
    const mcp=Object.hasOwn(before.data,'mcpServers')||Object.hasOwn(after.data,'mcpServers');
    const claude=Object.hasOwn(before.data,'permissions')||Object.hasOwn(after.data,'permissions');
    if(mcp&&claude)throw new ConfigError('Ambiguous mixed configuration; select a format explicitly.');
    if(!mcp&&!claude)throw new ConfigError('Cannot detect format; select claude-settings or mcp explicitly.');
    format=mcp?'mcp':'claude-settings';
  }
  if(!['mcp','claude-settings'].includes(format))throw new ConfigError('Unsupported format.');
  validate(before.data,format);validate(after.data,format);
  const findings=[];const coverage=[];
  const location=(doc,p)=>{while(!doc.locations.has(p)&&p)p=p.slice(0,p.lastIndexOf('/'));return doc.locations.get(p);};
  const add=(code,severity,message,p='',q=p,direction='review')=>findings.push({code,severity,direction,message,evidence:{before:location(before,p),after:location(after,q)}});
  function unknown(a,b,known,p=''){
    for(const k of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())if(!known.includes(k)){
      const pointer=p+'/'+esc(k);
      coverage.push({status:'unsupported',evidence:{before:location(before,pointer),after:location(after,pointer)}});
      if(JSON.stringify(exact(a[k],pointer,before.numberLiterals))!==JSON.stringify(exact(b[k],pointer,after.numberLiterals)))
        add('UNMODELED_CHANGE','medium','An unsupported field changed. Its permission impact is unknown; inspect the cited lines.',pointer);
    }
  }
  function sets(a,b,p,addCode,removeCode,addSeverity='high',removeSeverity='info'){
    const x=new Set(a??[]),y=new Set(b??[]);
    for(const v of [...y].sort())if(!x.has(v))add(addCode,addSeverity,'An entry was added. Review the cited source; values are omitted from reports.',p,p+'/'+b.indexOf(v),'potential_expansion');
    for(const v of [...x].sort())if(!y.has(v))add(removeCode,removeSeverity,'An entry was removed. Review the cited source; values are omitted from reports.',p+'/'+a.indexOf(v),p,'potential_reduction');
  }
  if(format==='claude-settings'){
    const a=before.data.permissions??{},b=after.data.permissions??{};
    sets(a.allow,b.allow,'/permissions/allow','ALLOW_ADDED','ALLOW_REMOVED');
    sets(a.deny,b.deny,'/permissions/deny','DENY_ADDED','DENY_REMOVED','info','high');
    sets(a.ask,b.ask,'/permissions/ask','ASK_ADDED','ASK_REMOVED','info','high');
    sets(a.additionalDirectories,b.additionalDirectories,'/permissions/additionalDirectories','DIRECTORY_ADDED','DIRECTORY_REMOVED');
    for(const f of findings)if(['DENY_ADDED','ASK_ADDED'].includes(f.code))f.direction='potential_reduction';else if(['DENY_REMOVED','ASK_REMOVED'].includes(f.code))f.direction='potential_expansion';
    if(!equal(a.defaultMode,b.defaultMode))add('MODE_CHANGED',b.defaultMode==='bypassPermissions'?'critical':'high','Default permission mode changed. Effective behavior also depends on managed settings and runtime flags.','/permissions/defaultMode');
    unknown(a,b,['allow','deny','ask','additionalDirectories','defaultMode'],'/permissions');
    unknown(before.data,after.data,['permissions']);
  }else{
    const a=before.data.mcpServers,b=after.data.mcpServers;
    for(const name of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){
      const p='/mcpServers/'+esc(name),x=a[name],y=b[name];
      if(!x){add('SERVER_ADDED','high','A server configuration was added. This does not prove which tools or permissions it exposes.', '/mcpServers',p,'potential_expansion');unknown({},y,['command','args','url','type','env','headers','disabled'],p);continue;}
      if(!y){add('SERVER_REMOVED','info','A server configuration was removed. Other settings may still enable the server.',p,'/mcpServers','potential_reduction');unknown(x,{},['command','args','url','type','env','headers','disabled'],p);continue;}
      for(const [k,code,sev,msg]of [
        ['command','COMMAND_CHANGED','high','The server executable changed; review its provenance without executing it.'],
        ['args','ARGUMENTS_CHANGED','high','Server arguments changed. Arguments can alter execution or access scope; values are withheld.'],
        ['url','ENDPOINT_CHANGED','high','The remote endpoint changed. Endpoint trust and authorization need review; URL values are withheld.'],
        ['type','TRANSPORT_CHANGED','medium','The declared transport changed.'],
        ['env','ENVIRONMENT_CHANGED','medium','Environment configuration changed; all values are withheld, including credentials.'],
        ['headers','HEADERS_CHANGED','medium','HTTP header configuration changed; all values are withheld.'],
        ['disabled','ENABLEMENT_CHANGED','high','Server enablement configuration changed; actual support depends on the client.']
      ])if(!equal(x[k],y[k]))add(code,sev,msg,p+'/'+k);
      unknown(x,y,['command','args','url','type','env','headers','disabled'],p);
    }
    unknown(before.data,after.data,['mcpServers']);
  }
  return {schema_version:'1.0',tool:{name:'MONNA Agent Permission Diff',version:VERSION},format,
    verdict:findings.some(f=>f.severity!=='info')?'review_required':'no_review_level_change_detected',findings,
    coverage:{status:coverage.length?'partial':'supported_fields_only',unsupported_fields:coverage},
    limitations:['Static comparison of two supplied files, not effective permission evaluation.','Managed settings, other configuration layers, runtime flags, server behavior and filesystem links are not resolved.','No server commands, hooks or tools are executed; no network requests are made.','Config values are withheld from reports. Source line locations identify evidence.']};
}
export function shouldFail(report,threshold='high'){
  const ranks={none:99,critical:3,high:2,medium:1,info:0};if(!Object.hasOwn(ranks,threshold))throw new ConfigError('Invalid failure threshold.');
  return report.findings.some(f=>ranks[f.severity]>=ranks[threshold]);
}
