import * as monaco from 'monaco-editor';
import { invoke } from '@tauri-apps/api/core';
import { sqlIntelligence } from './sql-intelligence';
import {pluginService} from './plugin-services';
const SqlWorker=function(){return pluginService('database')!.createSqlWorker()} as unknown as {new():Worker};
import type { DatabaseSession } from '../shared/contracts';
import type { SqlModel } from '../shared/sql-types';

/** Runs only in the opt-in native harness, against its disposable databases. */
export async function sqlIntelligenceSmoke(info: any) {
 const api=window.ide, checks:string[]=[], metrics:unknown[]=[];
 const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
 const wait=async(test:()=>boolean,label:string,ms=30000)=>{const end=Date.now()+ms;while(!test()){if(Date.now()>end)throw Error(label+' | '+document.getElementById('sql-source')?.textContent+' | focus='+editor.hasTextFocus()+' | language='+editor.getModel()?.getLanguageId()+' | widgets='+[...document.querySelectorAll('.suggest-widget')].map(w=>w.className+':'+w.textContent?.slice(0,250)).join(';'));await new Promise(r=>setTimeout(r,30));}};
 const progress=(text:string)=>invoke('ide',{method:'nativeSmokeProgress',args:['SQL: '+text]});
 const editor=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
 const key=(name:string,keyCode:number)=>editor.getDomNode()!.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown',{key:name,code:name,keyCode,which:keyCode,bubbles:true,cancelable:true}));
 const complete=async(id:string,marked:string)=>{
  const at=marked.indexOf('|'),text=marked.replace('|','');let result=await sqlIntelligence.complete(id,text,at);
  if(!result){await new Promise(r=>setTimeout(r,300));result=await sqlIntelligence.complete(id,text,at);}
  assert(result,'Completion unavailable: '+marked+' '+sqlIntelligence.entries.get(id)?.degraded);return result!;
 };
 const sessions:DatabaseSession[]=[];
 for(const input of info.database){
  await progress(input.driver+' fixtures');
  const setup=await api.databaseConnect(input);
  const schema=input.driver==='postgres'?'public':'fixture';
  const sql=`CREATE TABLE users (id INTEGER, name VARCHAR(80), email VARCHAR(80), engine_${input.driver} INTEGER); CREATE TABLE orders (id INTEGER, user_id INTEGER, total DECIMAL(10,2)); CREATE TABLE wide (${Array.from({length:140},(_,i)=>`col_${i} INTEGER`).join(',')});`+(input.driver==='postgres'?'CREATE SCHEMA billing;':'CREATE DATABASE billing;')+'CREATE TABLE billing.users (id INTEGER, billing_code VARCHAR(80));';
  const result=await api.databaseExecute(setup.id,sql);assert(result.every(r=>r.kind!=='error'),JSON.stringify(result));await api.databaseDisconnect(setup.id);
  document.getElementById('db-add')!.click();const dialog=document.querySelector<HTMLDialogElement>('.datasources-dialog')!;
  dialog.querySelector<HTMLButtonElement>(`[data-driver="${input.driver}"]`)!.click();
  for(const [name,value] of Object.entries({host:input.host,port:String(input.port),database:input.database,user:input.user,password:input.password,name:'SQL '+input.driver})){const field=dialog.querySelector<HTMLInputElement>(`[name="${name}"]`)!;field.value=String(value);field.dispatchEvent(new Event('input',{bubbles:true}));}
  const started=performance.now();document.getElementById('db-connect')!.click();
  await wait(()=>!dialog.open&&[...sqlIntelligence.entries.values()].some(e=>e.session.driver===input.driver),'Connect dialog '+input.driver);
  const entry=[...sqlIntelligence.entries.values()].find(e=>e.session.driver===input.driver)!;sessions.push(entry.session);
  await wait(()=>entry.state==='Ready'||entry.state==='Partial'||entry.state==='Unavailable','Metadata '+input.driver);
  assert(entry.state==='Ready','Catalog not ready: '+entry.errors.join(';'));
  metrics.push({driver:input.driver,coldReadyMs:performance.now()-started,relations:entry.relations,columns:entry.columns,bytes:entry.bytes});
  document.getElementById('db-console-open')!.click();await wait(()=>editor.getModel()?.uri.scheme==='php-ide-console','Console did not open');
  const id=entry.session.id;
  const cases:[string,string[],string[]][]=[
   [`SELECT u.| FROM ${schema}.users u`,['email','id','name','engine_'+input.driver],['billing_code','total']],
   ['WITH people AS (SELECT id, email AS contact FROM users) SELECT p.| FROM people p',['id','contact'],['email','name']],
   ['SELECT d.| FROM (SELECT user_id, SUM(total) AS amount FROM orders GROUP BY user_id) d',['user_id','amount'],['total','email']],
   ['WITH a AS (SELECT email AS contact FROM users), b AS (SELECT contact FROM a) SELECT b.| FROM b',['contact'],['id']],
   ['SELECT * FROM users u WHERE EXISTS (SELECT u.| FROM orders u)',['id','total','user_id'],['email']],
   ['SELECT * FROM users u JOIN (SELECT u.| FROM orders o) d ON true',[],['email','id']],
   ['SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM orders o) AND EXISTS (SELECT o.| FROM users p)',[],['total','id']],
   ['SELECT * FROM billing.us|',['users'],['orders']],
   ['INSERT INTO users (id, |) VALUES (1,2)',['email','name'],['id','total']],
   ['SELECT w.col_13| FROM wide w',['col_13','col_139'],['email']],
  ];
  for(const [sql,include,exclude] of cases){const r=await complete(id,sql);const labels=r.items.map(i=>i.label);for(const name of include)assert(labels.includes(name),input.driver+' missing '+name+' '+sql+' '+labels.join(','));for(const name of exclude)assert(!labels.includes(name),input.driver+' leaked '+name+' '+sql);}
  checks.push(`SQL ${input.driver}: real metadata, aliases, schemas, CTEs, derived tables, shadowing, correlation boundaries and INSERT targets`);
  await progress(input.driver+' automatic popup');
  const model=editor.getModel()!;model.setValue('SELECT * FROM ');editor.setPosition(model.getPositionAt(model.getValueLength()));editor.focus();
  await wait(()=>{editor.focus();return editor.hasTextFocus();},'Editor did not gain focus',5000);editor.trigger('native-sql','type',{text:'u'});
  await wait(()=>!!document.querySelector('.suggest-widget.visible .monaco-list-row'),'First-character suggestions did not open');
  await wait(()=>document.querySelector('.suggest-widget.visible')?.textContent?.includes('users')===true,'Real users missing in popup');
  if(input.driver==='postgres'&&info.docker.sqlCapture){await invoke('ide',{method:'nativeSmokeProgress',args:['shot:sql-completion:0:0:1:1']});await new Promise(r=>setTimeout(r,1500));}
  await progress(input.driver+' dismiss popup');editor.trigger('native-sql','hideSuggestWidget',{});await wait(()=>!document.querySelector('.suggest-widget.visible'),'Escape failed');
  await sqlIntelligence.refresh(id);assert(!document.querySelector('.suggest-widget.visible'),'Refresh reopened dismissed popup');
  await progress(input.driver+' accept and undo');for(const accept of ['Enter','Tab']){
   model.setValue('SELECT u.em FROM users u');editor.setPosition({lineNumber:1,column:12});editor.focus();editor.trigger('native-sql','editor.action.triggerSuggest',{});
   await wait(()=>document.querySelector('.suggest-widget.visible')?.textContent?.includes('email')===true,'Column popup missing');
   const old=model.getValue();key(accept,accept==='Enter'?13:9);await wait(()=>model.getValue()!==old,accept+' accept failed');assert(model.getValue()==='SELECT u.email FROM users u','Wrong replacement '+model.getValue());editor.trigger('native-sql','undo',{});assert(model.getValue()===old,'Completion undo failed');
  }
  await progress(input.driver+' warm requests');const before=sqlIntelligence.metadataRequests;const samples:number[]=[];
  for(let i=0;i<30;i++){const start=performance.now();await complete(id,`SELECT u.em| FROM users u /*${i}*/`);samples.push(performance.now()-start);}
  assert(sqlIntelligence.metadataRequests===before,'Warm completion made metadata calls');samples.sort((a,b)=>a-b);
  metrics.push({driver:input.driver,p50:samples[15],p95:samples[28],p99:samples[29],warmMetadataCalls:0});
  await api.databaseExecute(id,'-- schema change\nALTER TABLE users ADD fresh_column INTEGER');
  await wait(()=>entry.state==='Ready'&&entry.model.schemas.some(s=>s.tables.some(t=>t.name==='users'&&t.columns.some(c=>c.name==='fresh_column'))),'Automatic DDL metadata refresh');
  assert((await complete(id,'SELECT u.| FROM users u')).items.some(i=>i.label==='fresh_column'),'Local DDL not refreshed');
  const external=await api.databaseConnect(input);await api.databaseExecute(external.id,'ALTER TABLE users DROP COLUMN fresh_column');await api.databaseDisconnect(external.id);await sqlIntelligence.refresh(id);
  assert(!(await complete(id,'SELECT u.| FROM users u')).items.some(i=>i.label==='fresh_column'),'Dropped column remained');
  const namespace=input.driver==='postgres'?'CREATE SCHEMA fresh_schema':'CREATE DATABASE fresh_schema';
  await api.databaseExecute(id,namespace+'; CREATE TABLE fresh_schema.added (id INTEGER)');
  await wait(()=>entry.state==='Ready'&&entry.model.schemas.some(s=>s.name==='fresh_schema'&&s.tables.some(t=>t.name==='added')),'New namespace did not refresh automatically');
  assert((await complete(id,'SELECT * FROM fresh_schema.ad|')).items.some(i=>i.label==='added'),'New schema table not suggested');
  checks.push(`SQL ${input.driver}: automatic Monaco popup, acceptance/undo, dismissed refresh, local/external DDL and zero warm metadata calls`);
  if(input.driver==='postgres'){
   await progress('metadata deadline while query runs');
   const sleeping=api.databaseExecute(id,'SELECT pg_sleep(12)');await new Promise(r=>setTimeout(r,80));
   assert((await complete(id,'SELECT u.em| FROM users u')).items.some(i=>i.label==='email'),'Running query blocked cached completion');
   const start=performance.now();await sqlIntelligence.refresh(id);assert(performance.now()-start<10000&&entry.state==='Partial','Metadata lock deadline did not recover');
   await api.databaseCancel(id);await sleeping;await sqlIntelligence.refresh(id);assert(entry.state==='Ready','Metadata retry did not recover');
   checks.push('SQL: cached completion during active query, bounded metadata lock timeout and successful retry');
  }
 }
 await progress('connection isolation and PHP');
 const pg=sessions[0],my=sessions[1];
 assert(!(await complete(my.id,'SELECT u.| FROM users u')).items.some(i=>i.label==='engine_postgres'),'Connection metadata crossed');
 const disconnectedReply=sqlIntelligence.complete(pg.id,'SELECT u. FROM users u',9);sqlIntelligence.disconnect(pg.id);assert(await disconnectedReply===null,'Disconnected response accepted');await api.databaseDisconnect(pg.id);
 const pg2=await api.databaseConnect(info.database[0]);await sqlIntelligence.refresh(pg2.id);await wait(()=>sqlIntelligence.entries.get(pg2.id)?.state==='Ready','Reconnect metadata');
 const php=document.querySelector<HTMLButtonElement>('#tree button[aria-label="probe.php"]')??document.querySelector<HTMLButtonElement>('#tree button[aria-label="scratch.txt"]');assert(php,'Fixture file missing');php!.click();await wait(()=>editor.getModel()?.uri.scheme!=='php-ide-console','Workspace file did not open');
 // Use the public language API on an unsaved PHP document; binding is selected through the actual toolbar.
 const field=document.getElementById('sql-connection') as HTMLSelectElement;
 const phpPath='probe.php';sqlIntelligence.bind(phpPath,my.id);
 const sql="<?php $q = 'SELECT u.em FROM users u';",offset=sql.indexOf('u.em')+4;
 const reply=await api.language({method:'textDocument/completion',path:phpPath,text:sql,version:1,position:{line:0,character:offset}}) as any;
 assert(reply.items.some((i:any)=>i.label==='email'),'Embedded SQL did not use worker');
 sqlIntelligence.bind(phpPath,pg2.id);
 const switched=await api.language({method:'textDocument/completion',path:phpPath,text:sql.replace('u.em','u.engine_'),version:2,position:{line:0,character:offset+5}}) as any;
 assert(switched.items.some((i:any)=>i.label==='engine_postgres')&&!switched.items.some((i:any)=>i.label==='engine_mysql'),'Embedded connection switch leaked');
 assert(field.options.length>=3,'Visible connection chooser missing sessions');
 const fileModel=editor.getModel()!,original=fileModel.getValue();fileModel.setValue("<?php $q = 'SELECT u. FROM users u';");editor.setPosition(fileModel.getPositionAt(fileModel.getValue().indexOf('u.')+2));
 field.value=my.id;field.dispatchEvent(new Event('change',{bubbles:true}));editor.focus();editor.trigger('native-sql','editor.action.triggerSuggest',{});
 await wait(()=>document.querySelector('.suggest-widget.visible')?.textContent?.includes('engine_mysql')===true,'PHP popup not bound to MySQL');
 await progress('PHP switch connection');field.value=pg2.id;field.dispatchEvent(new Event('change',{bubbles:true}));editor.focus();await wait(()=>{editor.focus();return editor.hasTextFocus();},'PHP editor focus after connection switch',5000);editor.trigger('native-sql','editor.action.triggerSuggest',{});
 await wait(()=>document.querySelector('.suggest-widget.visible')?.textContent?.includes('engine_postgres')===true,'PHP popup did not switch connection');
 assert(!document.querySelector('.suggest-widget.visible')?.textContent?.includes('engine_mysql'),'PHP popup retained old connection');key('Escape',27);fileModel.setValue(original);
 const blade="@php $q = 'SELECT u.em FROM users u'; @endphp";sqlIntelligence.bind('probe.blade.php',my.id);const bladeAt=blade.indexOf('u.em')+4;
 const bladeReply=await api.language({method:'textDocument/completion',path:'probe.blade.php',text:blade,version:1,position:{line:0,character:bladeAt}}) as any;assert(bladeReply.items.some((i:any)=>i.label==='email'),'Blade literal did not complete');
 checks.push('SQL: session disconnect/reconnect isolation, PHP popup/connection chooser, Blade literals and native language pipeline');
 await progress('large catalog worker benchmark');
 const worker=new SqlWorker();let seq=0;const pending=new Map<number,(v:any)=>void>();
 const message=(data:any)=>new Promise<any>((resolve,reject)=>{const request=++seq;const timer=setTimeout(()=>reject(Error('Benchmark worker timeout')),20000);pending.set(request,v=>{clearTimeout(timer);resolve(v);});worker.postMessage({...data,request});});
 worker.onmessage=e=>{if(e.data.request)pending.get(e.data.request)?.(e.data);};
 const big:SqlModel={label:'synthetic',database:'benchmark',defaultSchema:'public',schemas:[{name:'public',tables:Array.from({length:10000},(_,n)=>({name:'table_'+n,kind:'table',columns:Array.from({length:10},(_,c)=>({name:'column_'+c,type:'integer'}))}))}]};
 worker.postMessage({type:'context',id:'benchmark',model:big,dialect:'postgres',revision:1});
 const latencies:number[]=[];const text='SELECT t.column_ FROM table_9999 t /*'+'x'.repeat(19950)+'*/';
 await message({type:'complete',id:'benchmark',revision:1,text,offset:16});
 for(let n=0;n<50;n++){const start=performance.now();const reply=await message({type:'complete',id:'benchmark',revision:1,text:text+` /*${n}*/`,offset:16});assert(reply.result?.items.some((i:any)=>i.label==='column_0'),'Large catalog lost columns');latencies.push(performance.now()-start);}
 latencies.sort((a,b)=>a-b);metrics.push({fixture:'10,000 relations / 100,000 columns / 20,000 characters',samples:50,p50:latencies[25],p95:latencies[47],p99:latencies[49],serializedBytes:new TextEncoder().encode(JSON.stringify(big)).length});worker.terminate();
 assert(latencies[47]<=100&&latencies[49]<=200,'Warm large-catalog latency budget exceeded: '+JSON.stringify(latencies));
 checks.push('SQL: production worker large-catalog benchmark met p95/p99 targets');
 const maximum:SqlModel={...big,schemas:[{name:'public',tables:Array.from({length:50000},(_,n)=>({name:'table_'+n,kind:'table',columns:Array.from({length:10},(_,c)=>({name:'column_'+c,type:'integer'}))}))}]};
 const maxWorker=new SqlWorker();let maxSequence=0;const maxPending=new Map<number,(v:any)=>void>();maxWorker.onmessage=e=>maxPending.get(e.data.request)?.(e.data);
 const maxRequest=()=>new Promise<any>((resolve,reject)=>{const request=++maxSequence;const timer=setTimeout(()=>reject(Error('Default-budget worker timeout')),20000);maxPending.set(request,v=>{clearTimeout(timer);resolve(v);});maxWorker.postMessage({type:'complete',id:'maximum',revision:1,request,text:'SELECT t.column_ FROM table_49999 t',offset:16});});
 maxWorker.postMessage({type:'context',id:'maximum',model:maximum,dialect:'postgres',revision:1});await maxRequest();const maxSamples:number[]=[];
 for(let i=0;i<20;i++){const start=performance.now();const result=await maxRequest();assert(result.result?.items.some((c:any)=>c.label==='column_0'),'Default-budget catalog lost columns');maxSamples.push(performance.now()-start);}
 maxSamples.sort((a,b)=>a-b);metrics.push({fixture:'50,000 relations / 500,000 columns (default budget)',p50:maxSamples[10],p95:maxSamples[18],p99:maxSamples[19],serializedBytes:new TextEncoder().encode(JSON.stringify(maximum)).length,heapBytes:'Unavailable through WebKit performance API; serialized payload measured separately'});maxWorker.terminate();
 checks.push('SQL: default-budget production worker latency and serialized catalog memory measured');
 for(const session of [...sqlIntelligence.entries.values()])await api.databaseDisconnect(session.session.id);
 await api.closeProject();assert(sqlIntelligence.entries.size===0&&sqlIntelligence.bindings.size===0,'Project close retained SQL state');checks.push('SQL: project close clears connection catalogs and file bindings');
 return {checks,metrics,parser:'dt-sql-parser 4.5.1',userAgent:navigator.userAgent};
}
