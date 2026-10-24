import * as monaco from 'monaco-editor';
import {invoke} from '@tauri-apps/api/core';
import {sqlIntelligence} from './sql-intelligence';

/** Opt-in real Tauri window scenarios; all inputs belong to the disposable harness. */
export async function sqlDialectsSmoke(info:any){
 const api=window.ide,checks:string[]=[],metrics:unknown[]=[];
 const editor=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
 const assert=(v:unknown,m:string)=>{if(!v)throw Error(m);};
 const wait=async(test:()=>boolean,label:string,ms=30000)=>{const end=Date.now()+ms;while(!test()){if(Date.now()>end)throw Error(label+' '+document.getElementById('sql-source')?.textContent);await new Promise(r=>setTimeout(r,30));}};
 const progress=(s:string)=>invoke('ide',{method:'nativeSmokeProgress',args:['SQL dialects: '+s]});
 const complete=async(id:string,marked:string)=>{let r=await sqlIntelligence.complete(id,marked.replace('|',''),marked.indexOf('|'));if(!r){await new Promise(r=>setTimeout(r,300));r=await sqlIntelligence.complete(id,marked.replace('|',''),marked.indexOf('|'));}assert(r,'No completion '+marked);return r!;};
 const sessions:string[]=[];
 for(const input of info.database){
  const driver=input.driver,oracle=driver==='oracle',fold=(v:string)=>oracle?v.toUpperCase():v;
  await progress(driver+' setup');const setup=await api.databaseConnect(input);
  const run=async(id:string,sql:string)=>{const r=await api.databaseExecute(id,sql);assert(r.every(v=>v.kind!=='error'),driver+' SQL failed '+JSON.stringify(r));};
  await run(setup.id,`CREATE TABLE users (id INTEGER, name VARCHAR(80), email VARCHAR(80), engine_${driver} INTEGER); CREATE TABLE orders (id INTEGER, user_id INTEGER, total DECIMAL(10,2)); CREATE TABLE wide (${Array.from({length:140},(_,n)=>`col_${n} INTEGER`).join(',')}); CREATE VIEW contacts AS SELECT email FROM users`);
  await run(setup.id,driver==='sqlserver'?'CREATE TABLE [Odd Table] ([Display Name] INTEGER)':'CREATE TABLE "Odd Table" ("Display Name" INTEGER)');
  if(driver==='sqlserver')await run(setup.id,'CREATE SCHEMA billing; CREATE TABLE billing.users (billing_code INTEGER)');
  await api.databaseDisconnect(setup.id);
  document.getElementById('db-add')!.click();const dialog=document.querySelector<HTMLDialogElement>('.datasources-dialog')!;dialog.querySelector<HTMLButtonElement>(`[data-driver="${driver}"]`)!.click();
  for(const [name,value] of Object.entries({name:'SQL '+driver,...(driver==='sqlite'?{file:input.file}:{host:input.host,port:input.port,database:input.database,user:input.user,password:input.password})})){
   const field=dialog.querySelector<HTMLInputElement>(`[name="${name}"]`)!;field.value=String(value);field.dispatchEvent(new Event('input',{bubbles:true}));
  }
  if(driver==='sqlserver'){const select=dialog.querySelector<HTMLSelectElement>('[name="sslMode"]')!;select.value='require';select.dispatchEvent(new Event('change',{bubbles:true}));}
  const started=performance.now();document.getElementById('db-connect')!.click();await wait(()=>!dialog.open&&[...sqlIntelligence.entries.values()].some(e=>e.session.driver===driver),'Connect '+driver);
  const entry=[...sqlIntelligence.entries.values()].find(e=>e.session.driver===driver)!,id=entry.session.id;sessions.push(id);
  await wait(()=>['Ready','Partial','Unavailable'].includes(entry.state),'Catalog '+driver);assert(entry.state==='Ready',driver+' catalog '+entry.errors.join(';'));assert(entry.columns>=148,driver+' incomplete wide catalog '+entry.columns);
  metrics.push({driver,version:entry.session.version,readyMs:performance.now()-started,columns:entry.columns,relations:entry.relations,defaultSchema:entry.model.defaultSchema});
  document.getElementById('db-console-open')!.click();await wait(()=>editor.getModel()?.uri.scheme==='php-ide-console','Console');
  const cases:[string,string[],string[]][]=[
   ['SELECT u.| FROM users u',['id','name','email','engine_'+driver],['total']],
   ['WITH people AS (SELECT email AS contact FROM users) SELECT p.| FROM people p',['contact'],['email']],
   ['SELECT d.| FROM (SELECT user_id, SUM(total) AS amount FROM orders GROUP BY user_id) d',['user_id','amount'],['total']],
   ['SELECT v.| FROM contacts v',['email'],['id']],
   ['SELECT w.col_13| FROM wide w',['col_13','col_139'],['email']],
   ['SELECT * FROM users u JOIN (SELECT u.| FROM orders o) d ON 1=1',[],['email','id']],
   [`SELECT * FROM ${entry.model.defaultSchema}.us|`,['users'],['orders']],
  ];
  cases.push([driver==='sqlserver'?'SELECT x.| FROM [Odd Table] x':'SELECT x.| FROM "Odd Table" x',['Display Name'],['id']]);
  if(driver==='sqlserver')cases.push(['SELECT b.| FROM billing.users b',['billing_code'],['email']],['SELECT * FROM users u CROSS APPLY (SELECT u.|) d',['email','id'],[]],['SELECT d.| FROM (SELECT TOP (1) email AS contact FROM users) d',['contact'],['email']]);
  for(const [sql,yes,no] of cases){const r=await complete(id,sql),labels=r.items.map(i=>i.label);for(const n of yes)assert(labels.includes(n==='Display Name'?n:fold(n)),driver+' missing '+n+' '+sql+' '+labels);for(const n of no)assert(!labels.includes(n==='Display Name'?n:fold(n)),driver+' leaked '+n+' '+sql);}
  if(driver!=='sqlite')assert(!(await complete(id,'SELECT id FROM users WHERE id=1 |')).items.some(i=>i.kind==='keyword'&&i.label==='LIMIT'),'Unsupported LIMIT keyword '+driver);
  await progress(driver+' popup');const model=editor.getModel()!;model.setValue('SELECT * FROM ');editor.setPosition(model.getPositionAt(model.getValueLength()));await wait(()=>{editor.focus();return editor.hasTextFocus();},'Focus',5000);editor.trigger('native-dialect','type',{text:'u'});
  await wait(()=>document.querySelector('.suggest-widget.visible')?.textContent?.includes(fold('users'))===true,'First-character real table popup '+driver);editor.trigger('native-dialect','hideSuggestWidget',{});
  for(const accept of ['Enter','Tab']){
   model.setValue('SELECT u.em FROM users u');editor.setPosition({lineNumber:1,column:12});await wait(()=>{editor.focus();return editor.hasTextFocus();},'Focus column',5000);editor.trigger('native-dialect','editor.action.triggerSuggest',{});
   await wait(()=>document.querySelector('.suggest-widget.visible')?.textContent?.includes(fold('email'))===true,'Column popup '+driver);
   const old=model.getValue();editor.getDomNode()!.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown',{key:accept,code:accept,keyCode:accept==='Enter'?13:9,which:accept==='Enter'?13:9,bubbles:true,cancelable:true}));
   await wait(()=>model.getValue()!==old,'Accept '+driver);assert(model.getValue()==='SELECT u.'+fold('email')+' FROM users u','Inserted wrong identifier '+model.getValue());editor.trigger('native-dialect','undo',{});assert(model.getValue()===old,'Undo');
  }
  const before=sqlIntelligence.metadataRequests;for(let n=0;n<10;n++)await complete(id,'SELECT u.em| FROM users u');assert(before===sqlIntelligence.metadataRequests,'Warm metadata calls');
  await run(id,'ALTER TABLE users ADD fresh_column INTEGER');await wait(()=>entry.state==='Ready'&&entry.model.schemas.some(s=>s.tables.some(t=>t.name===fold('users')&&t.columns.some(c=>c.name===fold('fresh_column')))),'DDL refresh '+driver);
  if(driver==='sqlserver'){
   await run(id,'CREATE DATABASE completion_cs COLLATE Latin1_General_100_CS_AS; USE completion_cs; CREATE TABLE Users (CaseColumn INTEGER)');
   await sqlIntelligence.refresh(id);await wait(()=>entry.state==='Ready'&&entry.model.database==='completion_cs','SQL Server database switch');
   assert(entry.model.caseSensitiveTables===true,'SQL Server case sensitivity not read');
   assert((await complete(id,'SELECT u.| FROM Users u')).items.some(i=>i.label==='CaseColumn'),'Case-sensitive table lost');
   assert(!(await complete(id,'SELECT u.| FROM users u')).items.some(i=>i.kind==='column'),'Wrong-case table resolved');
   await run(id,'USE master');await sqlIntelligence.refresh(id);await wait(()=>entry.state==='Ready'&&entry.model.database==='master','SQL Server context restore');
   checks.push('SQL Server: real case-sensitive database collation, exact identifier binding, USE invalidation and context restoration');
  }
  if(driver==='sqlite'){
   await run(id,"ATTACH DATABASE ':memory:' AS billing; CREATE TABLE billing.users (billing_code TEXT); CREATE TEMP TABLE users (temp_column TEXT); CREATE TABLE generated (base INT, doubled INT GENERATED ALWAYS AS (base*2) VIRTUAL)");await sqlIntelligence.refresh(id);
   assert((await complete(id,'SELECT u.| FROM users u')).items.some(i=>i.label==='temp_column'),'SQLite temp precedence');
   assert((await complete(id,'SELECT u.| FROM main.users u')).items.some(i=>i.label==='email'),'SQLite main qualification');
   assert((await complete(id,'SELECT u.| FROM billing.users u')).items.some(i=>i.label==='billing_code'),'SQLite attached metadata');
   assert((await complete(id,'SELECT g.| FROM generated g')).items.some(i=>i.label==='doubled'),'SQLite generated columns');
   await run(id,'DETACH DATABASE billing');await sqlIntelligence.refresh(id);assert(!entry.model.schemas.some(s=>s.name==='billing'),'Detached namespace retained');
  }
  for(const other of sessions.filter(s=>s!==id)){const own=sqlIntelligence.entries.get(other)!,ns=own.model.defaultSchema;const r=await complete(other,`SELECT u.| FROM ${ns}.users u`);assert(r.items.some(i=>i.label.toLowerCase()==='engine_'+own.session.driver),'Prior connection lost its columns');assert(!r.items.some(i=>i.label.toLowerCase()==='engine_'+driver),'Session metadata leaked');}
  checks.push(`SQL ${driver}: active-session real tables/views and 140-column table; aliases, schemas, CTEs, derived scopes; first-character Monaco popup, Enter/Tab, undo, automatic DDL refresh and zero warm metadata queries`);
  if(driver==='sqlite')checks.push('SQLite: attached main/billing and temp shadowing, generated columns, detach invalidation in active session');
 }
 for(const id of sessions)await api.databaseDisconnect(id);await api.closeProject();assert(!sqlIntelligence.entries.size,'Close retained catalogs');
 return {checks,metrics,parser:'dt-sql-parser 4.5.1 + bounded dialect rules',userAgent:navigator.userAgent};
}
