// Strict, bounded JSON parser with duplicate-key rejection and source locations.
// Error messages never include input values or keys.
export class ConfigError extends Error {}
export function parseConfig(source) {
  if (typeof source !== 'string' || source.length > 1000000) throw new ConfigError('Input must be JSON text of at most 1000000 characters.');
  let i = 0, nodes = 0;
  const locations = new Map(); const numberLiterals = new Map(); const newlines = [-1];
  for (let n = 0; n < source.length; n++) if (source[n] === '\n') newlines.push(n);
  function where(index) {
    let lo=0,hi=newlines.length;
    while(lo+1<hi){const m=(lo+hi)>>1;if(newlines[m]<index)lo=m;else hi=m;}
    return {line:lo+1,column:index-newlines[lo]};
  }
  const error = msg => { const p=where(i); throw new ConfigError(`${msg} at line ${p.line}, column ${p.column}.`); };
  const ws = () => { while(/[\x20\t\r\n]/.test(source[i]??'!'))i++; };
  function str() {
    const start=i++;
    while(i<source.length){const c=source[i++];if(c==='\\'){i++;continue;}if(c==='"'){try{return JSON.parse(source.slice(start,i));}catch{error('Invalid JSON string');}}}
    error('Unterminated JSON string');
  }
  function value(pointer,depth) {
    if(depth>64 || ++nodes>50000)error('JSON complexity limit exceeded');
    ws();locations.set(pointer,where(i));const c=source[i];
    if(c==='"')return str();
    if(c==='{'){
      i++;ws();const obj=Object.create(null);if(source[i]==='}'){i++;return obj;}
      while(true){ws();if(source[i]!=='"')error('Expected object key');const key=str();if(Object.hasOwn(obj,key))error('Duplicate object key');ws();if(source[i++]!==':')error('Expected colon');obj[key]=value(pointer+'/'+key.replaceAll('~','~0').replaceAll('/','~1'),depth+1);ws();if(source[i]==='}'){i++;return obj;}if(source[i++]!==',')error('Expected comma');}
    }
    if(c==='['){i++;ws();const arr=[];if(source[i]===']'){i++;return arr;}while(true){arr.push(value(pointer+'/'+arr.length,depth+1));ws();if(source[i]===']'){i++;return arr;}if(source[i++]!==',')error('Expected comma');}}
    const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
    if(!match)error('Invalid JSON value');i+=match[0].length;const v=JSON.parse(match[0]);if(typeof v==='number'){
      if(!Number.isFinite(v))error('Non-finite number');
      // Retain the original decimal value for comparison before binary64
      // rounding can erase a change. This metadata never enters reports.
      numberLiterals.set(pointer,match[0]);
    }return v;
  }
  const data=value('',0);ws();if(i!==source.length)error('Unexpected trailing content');
  if(!data||typeof data!=='object'||Array.isArray(data))error('Configuration root must be an object');
  return {data,locations,numberLiterals};
}
