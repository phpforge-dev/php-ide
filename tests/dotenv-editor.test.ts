import test from 'node:test';
import assert from 'node:assert/strict';
import { DotenvPlugin, envReferences, isEnvPath } from '../shared/language/plugins/dotenv';
import { PluginHost } from '../shared/language/plugins/host';
import { NativeLanguage } from '../src/native-language';
const data: Record<string,string>={'.env':'APP_NAME=Disk\nDB_PASSWORD=fixture-secret\n', '.env.testing':'APP_NAME=Test'};
const files={root:'/fixture',read:async(p:string)=>data[p]??null,list:async(_d:string,accept:(s:string)=>boolean)=>Object.keys(data).filter(accept),exists:async(p:string)=>p in data,uri:(p:string)=>'file:///fixture/'+p};
test('dotenv routes and interpolation exclude literals, comments and escaped dollars',()=>{
 assert(isEnvPath('.env.testing'));assert(isEnvPath('nested/.env'));assert(!isEnvPath('.envrc'));
 const text=`# COMMENT=\${NO}
A='\${LITERAL}'
B="\${APP_NAME}" # \${COMMENT}
C=\\\${ESCAPED}
`;
 assert.deepEqual(envReferences(text).map(r=>r.key),['APP_NAME']);
});
test('host uses unsaved declarations and does not include values in suggestions',async()=>{
 const host=new PluginHost(files,[new DotenvPlugin()]);
 const text='  export APP_NAME=Unsaved\nMAIL="${APP_NAME}"\nLOCAL_NAME=Local\nOTHER="${LOCAL_}"';
 const defs=await host.defineCode('.env',text,text.indexOf('${APP_NAME}')+4);
 assert.equal(defs?.[0].range.start.character,9);assert.equal(defs?.[0].range.start.line,0);
 const result=await host.completeCode('.env',text,text.indexOf('${LOCAL_}')+8);
 assert(result?.items.some(i=>i.label==='LOCAL_NAME'));
 assert(!JSON.stringify(result).includes('fixture-secret'));
 assert.deepEqual(await host.defineCode('.env',"X='${APP_NAME}'",7),[]);
});
test('native dotenv requests never fall through to PHP language server',async()=>{
 const native=new NativeLanguage(async(method,args=[])=>{
  if(method==='workspace')return{root:'/fixture',rootUri:'file:///fixture/'};
  if(method==='listFiles')return Object.keys(data);
  if(method==='read'){const p=String(args[0]);return{text:data[p]??'',uri:files.uri(p)};}
  if(method==='fileExists'){if(String(args[0]) in data)return true;throw Error('missing');}
  throw Error('Unexpected transport '+method);
 });
 const text='MAIL="${APP_NAME}"';
 const result:any=await native.request({method:'textDocument/definition',path:'.env.testing',text,version:1,position:{line:0,character:12}});
 assert.equal(result[0].uri,'file:///fixture/.env');
 assert.equal(await native.request({method:'textDocument/hover',path:'.env',text,version:1,position:{line:0,character:12}}),null);
});
