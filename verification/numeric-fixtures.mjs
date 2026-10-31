// Fictional inputs. These commands and extension values are never executed.
export const canary='NUMERIC_PUBLIC_FIXTURE_NEVER_EXECUTE';
export function document(number,{claude=false}={}){
  const value={revision:'NUMBER_LITERAL'};
  const data=claude?{permissions:{},clientExtension:value}:{mcpServers:{fictional:{command:canary,extension:value}}};
  return JSON.stringify(data,null,2).replace('"NUMBER_LITERAL"',number);
}
export const changes=[
  {name:'positive-integer',before:'9007199254740992',after:'9007199254740993'},
  {name:'negative-integer',before:'-9007199254740992',after:'-9007199254740993'},
  {name:'decimal-tail',before:'1',after:'1.0000000000000001',claude:true},
  {name:'underflow',before:'1e-400',after:'2e-400'},
  {name:'fraction-rounding',before:'0.1',after:'0.10000000000000001',claude:true},
  {name:'large-exponent',before:'1e20',after:'100000000000000000001'},
];
export const equivalents=[
  ['1','1.0'],['1','1e0'],['1000','1e3'],['0.001','10e-4'],
  ['-0','0'],['0','0.000e999999999999999999999'],
  ['9007199254740993','90071992547409930e-1'],
  ['1e-400','10e-401'],['-100.00','-1e+2'],
];
export const browserCases=[
  changes[0],changes[2],changes[3],
  {name:'equal-large-integer',before:equivalents[6][0],after:equivalents[6][1],equal:true},
  {name:'equal-underflow',before:equivalents[7][0],after:equivalents[7][1],equal:true},
  {name:'number-to-string',before:'1',after:'"1"',claude:true},
];
