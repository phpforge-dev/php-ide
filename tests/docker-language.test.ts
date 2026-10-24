import { setExternalPlugins } from '../shared/language/plugins/host';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DockerPlugin, dockerLines } from '../shared/language/plugins/docker';
import { PluginHost } from '../shared/language/plugins/host';
import { NativeLanguage } from '../src/native-language';
import { isComposeDocument, isDockerfilePath } from '../shared/docker-document';
const compose='services:\n  app:\n    image: php:8.3-cli\n    depends_on:\n      - db\n  db:\n    image: postgres:16\n';
const files=(data:Record<string,string>)=>({root:'/fixture',read:async(p:string)=>data[p]??null,list:async(_d:string,accept:(p:string)=>boolean)=>Object.keys(data).filter(accept),exists:async(p:string)=>p in data,uri:(p:string)=>'file:///fixture/'+p});
const site=(path:string,text:string,offset=text.length)=>({path,text,offset,blade:false});
test('file associations cover variants, custom Compose names and ordinary YAML stays ordinary',()=>{
 for(const p of ['Dockerfile','Dockerfile.dev','docker/Dockerfile-prod','app.dockerfile'])assert(isDockerfilePath(p),p);
 for(const p of ['compose.yml','docker-compose.override.yaml','composer.yml'])assert(isComposeDocument(p),p);
 assert(isComposeDocument('deployment.yml',compose));assert(!isComposeDocument('config.yml','framework:\n  secret: x'));assert(!isComposeDocument('config/services.yaml','services:\n  _defaults:\n    autowire: true\n  App\\Service: ~'));
});
test('activation re-evaluates when Docker files appear',async()=>{
 const data:Record<string,string>={};const host=new PluginHost(files(data),[new DockerPlugin()]);assert.deepEqual(await host.status(),[]);
 data['Dockerfile.dev']='FROM php:8.3-cli';host.changed('/fixture/Dockerfile.dev');assert.equal((await host.status())[0].id,'docker');
 delete data['Dockerfile.dev'];host.changed('Dockerfile.dev');assert.deepEqual(await host.status(),[]);
});
test('Dockerfile continuations and heredocs do not become bogus instructions',async()=>{
 const text='ARG BASE=php:8.3-cli\nFROM $BASE AS base\nRUN echo one \\\n && echo two\nRUN <<EOF\necho hello\nEOF\nCOPY --from=base /a /b\n';
 assert.deepEqual(dockerLines(text).map(l=>l.name),['ARG','FROM','RUN','RUN','COPY']);
 assert.deepEqual(await new DockerPlugin().diagnose('Dockerfile',text),[]);
 const problems=await new DockerPlugin().diagnose('Dockerfile','RUN echo hi\nFRMO php\nFROM\n');
 assert(problems.some(d=>d.code==='docker.from'));assert(problems.some(d=>d.code==='docker.instruction'));assert(problems.some(d=>d.code==='docker.arguments'));
});
test('stage completion and navigation use accurate positions with extra spaces',async()=>{
 const plugin=new DockerPlugin(),f=files({});const text='FROM    php:8.3-cli AS builder\nCOPY --from=builder /app /app';
 const defs=await plugin.defineCode(site('Dockerfile',text,text.indexOf('--from=')+9),f);assert.equal(defs?.[0].range.start.character,text.indexOf('builder'));
 const result=await plugin.completeCode(site('Dockerfile',text.slice(0,text.indexOf('--from=')+8)),f);assert(result?.items.some(i=>i.label==='builder'));
 const instruction=await plugin.completeCode(site('Dockerfile','CO'),f);assert(instruction?.items.some(i=>i.label==='COPY'));
});
test('Compose suggestions follow section and do not pollute non-Compose YAML',async()=>{
 const plugin=new DockerPlugin(),f=files({});
 const ask=(t:string)=>plugin.completeCode(site('composer.yml',t),f);
 assert((await ask('serv'))?.items.some(i=>i.label==='services'));
 assert((await ask('services:\n  app:\n    im'))?.items.some(i=>i.label==='image'));
 assert((await ask('services:\n  app:\n    build:\n      dock'))?.items.some(i=>i.label==='dockerfile'));
 assert.equal(await plugin.completeCode(site('config.yml','framework:\n  sec'),f),null);
});
test('Compose parser reports malformed YAML, duplicate keys and selected type errors without values',async()=>{
 const plugin=new DockerPlugin();
 const dup=await plugin.diagnose('compose.yml','services:\n  app:\n    image: secret-fixture\n    image: other\n');assert(dup.some(d=>d.code==='docker.yaml.DUPLICATE_KEY'));assert(!JSON.stringify(dup).includes('secret-fixture'));
 assert((await plugin.diagnose('compose.yml','services: [')).some(d=>d.code.startsWith('docker.yaml.')));
 assert((await plugin.diagnose('compose.yml','services: []')).some(d=>d.code==='docker.compose.services'));
 assert((await plugin.diagnose('compose.yml','services:\n  app:\n    ports: "8080:80"')).some(d=>d.code==='docker.compose.type'));
});
test('valid overrides, block commands, anchors and extension keys avoid false diagnostics',async()=>{
 const text='x-base: &base\n  image: php:8.3-cli\nservices:\n  app:\n    <<: *base\n    command: |\n      echo hello\n      echo world\n  worker: *base\n';
 assert.deepEqual(await new DockerPlugin().diagnose('compose.yml',text),[]);
 assert.deepEqual(await new DockerPlugin().diagnose('docker-compose.override.yml','services:\n  app:\n    environment:\n      APP_DEBUG: "true"'),[]);
});
test('depends_on navigation and completion use current unsaved services',async()=>{
 const plugin=new DockerPlugin(),f=files({});
 const defs=await plugin.defineCode(site('deployment.yaml',compose,compose.indexOf('- db')+3),f);assert.equal(defs?.[0].range.start.line,5);
 const text=compose+'  worker:\n    depends_on:\n      - d';
 assert((await plugin.completeCode(site('compose.yml',text),f))?.items.some(i=>i.label==='db'));
});
test('Compose env completion shows names without secrets',async()=>{
 const f=files({'.env':'DB_PASSWORD=fixture-secret\nAPP_NAME=Demo'});
 const result=await new DockerPlugin().completeCode(site('compose.yml','services:\n  app:\n    image: "${APP_'),f);
 assert(result?.items.some(i=>i.label==='APP_NAME'));assert(!JSON.stringify(result).includes('fixture-secret'));
});
test('NativeLanguage routes Docker documents without a PHP language process',async t=>{
 setExternalPlugins(()=>[new DockerPlugin()]);t.after(()=>setExternalPlugins(null));
 const data={'compose.yml':compose};const f=files(data);
 const native=new NativeLanguage(async(method,args=[])=>{if(method==='workspace')return{root:f.root,rootUri:'file:///fixture/'};if(method==='listFiles')return Object.keys(data);if(method==='read')return{text:await f.read(String(args[0])),uri:f.uri(String(args[0]))};if(method==='fileExists')throw Error('missing');throw Error('unexpected transport '+method);});
 assert((await native.plugins()).some(p=>p.id==='docker'));
 const result:any=await native.request({method:'textDocument/diagnostic',path:'compose.yml',text:'services: []',version:1,position:{line:0,character:0}});assert(result.some((d:any)=>d.code==='docker.compose.services'));
});
