import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SqlIntelligence} from '../.tools/plugin-packages/database/shared/sql-intelligence/catalog';
import type {DatabaseSession} from '../shared/contracts';
class FakeWorker {
 onmessage:((event:MessageEvent)=>void)|null=null;onerror:((event:ErrorEvent)=>void)|null=null;terminated=false;
 sent:any[]=[];stall=false;
 postMessage(message:any){this.sent.push(message);if(message.type==='context')queueMicrotask(()=>{this.onmessage?.({data:{type:'ready'}} as MessageEvent);this.onmessage?.({data:{type:'context-ready',id:message.id}} as MessageEvent);});if(message.type==='complete'&&!this.stall)queueMicrotask(()=>this.onmessage?.({data:{request:message.request,revision:message.revision,result:{items:[{label:message.id}]}}} as MessageEvent));}
 terminate(){this.terminated=true;}
}
const session=(id='one'):DatabaseSession=>({id,label:id,driver:'postgres',schemas:['public','billing','information_schema']});
const context={database:'fixture',defaultSchema:'public',searchPath:['public'],fallback:false};
test('catalog coalesces loading, incrementally prepares columns, and serves warm completions locally',async()=>{
 const w=new FakeWorker(),c=new SqlIntelligence(()=>w as unknown as Worker);let reads=0;
 c.configure(async(method,args)=>{reads++;if(method==='databaseCompletionContext')return context;return{rows:args[3]?[['users','email','text','YES']]:[['users','BASE TABLE']],hasMore:false};});
 try{c.connect(session());await Promise.all([c.refresh('one'),c.refresh('one')]);assert.equal(c.entries.get('one')!.state,'Ready');assert.equal(reads,5);assert.equal(c.entries.get('one')!.columns,2);assert(w.sent.some(m=>m.type==='schema'));const before=reads;await c.complete('one','SELECT ',7);await c.complete('one','SELECT e',8);assert.equal(reads,before);assert.equal(c.entries.get('one')!.model.schemas[0].tables[0].columns[0].name,'email');}finally{c.reset();}
});
test('late metadata after disconnect cannot restore a catalog or leak to a second session',async()=>{
 const w=new FakeWorker(),c=new SqlIntelligence(()=>w as unknown as Worker);let release!:(v:unknown)=>void;
 c.configure(async()=>new Promise(resolve=>{release=resolve;}));c.connect(session());c.disconnect('one');release(context);await new Promise(r=>setTimeout(r,1));assert.equal(c.entries.size,0);assert(!w.sent.some(m=>m.type==='context'));c.reset();
});
test('failed namespace refresh preserves cached metadata with partial state and retry',async()=>{
 const c=new SqlIntelligence(()=>new FakeWorker() as unknown as Worker);let fail=false;
 c.configure(async(method,args)=>{if(method==='databaseCompletionContext')return context;if(fail&&args[1]==='billing')throw Error('permission denied');return{rows:args[3]?[['users','email','text','YES']]:[['users','BASE TABLE']],hasMore:false};});
 try{c.connect(session());await c.refresh('one');fail=true;await c.refresh('one');const e=c.entries.get('one')!;assert.equal(e.state,'Partial');assert(e.errors[0].includes('billing'));assert.equal(e.model.schemas.find(s=>s.name==='billing')!.tables[0].columns[0].name,'email');fail=false;await c.refresh('one');assert.equal(e.state,'Ready');}finally{c.reset();}
});
test('metadata limits are explicit and namespace narrowing recovers',async()=>{
 const c=new SqlIntelligence(()=>new FakeWorker() as unknown as Worker,{relations:1,columns:4,bytes:10000});
 c.configure(async(method,args)=>{if(method==='databaseCompletionContext')return context;return{rows:args[3]?[['users','id','integer','NO']]:[['users','BASE TABLE']],hasMore:false};});
 try{c.connect(session());await c.refresh('one');assert.equal(c.entries.get('one')!.state,'Partial');assert(c.entries.get('one')!.errors.some(e=>e.includes('budget')));await c.refresh('one',['public']);assert.equal(c.entries.get('one')!.state,'Ready');}finally{c.reset();}
});
test('refresh discovers namespaces added after the initial connection',async()=>{
 const c=new SqlIntelligence(()=>new FakeWorker() as unknown as Worker);let schemas=['public'];
 c.configure(async(method,args)=>method==='databaseCompletionContext'?{...context,schemas}:{rows:args[3]?[['users','id','integer','NO']]:[['users','BASE TABLE']],hasMore:false});
 try{c.connect(session());await c.refresh('one');assert.equal(c.entries.get('one')!.model.schemas.length,1);schemas=['public','fresh_schema'];await c.refresh('one');assert(c.entries.get('one')!.model.schemas.some(s=>s.name==='fresh_schema'));}finally{c.reset();}
});
test('bindings are explicit, stale pending responses are rejected, and reset discards project state',async()=>{
 const w=new FakeWorker(),c=new SqlIntelligence(()=>w as unknown as Worker);c.configure(async(method,args)=>method==='databaseCompletionContext'?context:{rows:[],hasMore:false});
 try{c.connect(session());await c.refresh('one');assert.equal(c.selected('file.php'),undefined);c.bind('file.php','one');assert.equal(c.selected('file.php')?.session.id,'one');const switched=c.complete('one','SELECT ',7);c.bind('file.php','two');assert.equal(await switched,null);const p=c.complete('one','SELECT ',7);c.disconnect('one');assert.equal(await p,null);c.reset();assert.equal(c.bindings.size,0);assert(w.terminated);}finally{c.reset();}
});
test('a stalled worker is terminated at the request deadline and can recover without losing metadata',async()=>{
 const workers:FakeWorker[]=[];const c=new SqlIntelligence(()=>{const w=new FakeWorker();workers.push(w);return w as unknown as Worker;});
 c.configure(async(method)=>method==='databaseCompletionContext'?context:{rows:[],hasMore:false});
 try{c.connect(session());await c.refresh('one');workers[0].stall=true;assert.equal(await c.complete('one','SELECT ',7),null);assert(workers[0].terminated);assert(c.entries.get('one')!.degraded?.includes('200 ms'));await c.complete('one','SELECT ',7);await new Promise(r=>setTimeout(r,0));assert((await c.complete('one','SELECT ',7))?.items.length);assert.equal(workers.length,2);}finally{c.reset();}
});
test('driver-sized continuation pages load every Oracle column without assuming a 5000-row page',async()=>{
 const c=new SqlIntelligence(()=>new FakeWorker() as unknown as Worker),offsets:number[]=[];
 c.configure(async(method,args)=>{
  if(method==='databaseCompletionContext')return{...context,defaultSchema:'FIXTURE',searchPath:['FIXTURE'],schemas:['FIXTURE']};
  if(!args[3])return{rows:[['WIDE','BASE TABLE']],hasMore:false,nextOffset:80};
  const offset=Number(args[2]);offsets.push(offset);
  return{rows:Array.from({length:Math.min(80,140-offset)},(_,i)=>['WIDE','COL_'+(offset+i),'NUMBER','YES']),hasMore:offset===0,nextOffset:offset+80};
 });
 try{c.connect({...session(),driver:'oracle'});await c.refresh('one');assert.equal(c.entries.get('one')!.state,'Ready');assert.deepEqual(offsets,[0,80]);assert.equal(c.entries.get('one')!.columns,140);assert.equal(c.entries.get('one')!.model.schemas[0].tables[0].columns.at(-1)?.name,'COL_139');}finally{c.reset();}
});
test('SQLite attachment names are not filtered using another engine system-schema names',async()=>{
 const c=new SqlIntelligence(()=>new FakeWorker() as unknown as Worker);
 c.configure(async(method)=>method==='databaseCompletionContext'?{...context,defaultSchema:'main',schemas:['main','sys','pg_fixture']}:{rows:[],hasMore:false});
 try{c.connect({...session(),driver:'sqlite'});await c.refresh('one');assert.deepEqual(c.entries.get('one')!.model.schemas.map(s=>s.name),['main','sys','pg_fixture']);}finally{c.reset();}
});
