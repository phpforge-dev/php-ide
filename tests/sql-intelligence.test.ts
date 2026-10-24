import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResolver } from '../.tools/plugin-packages/database/shared/sql-intelligence/resolve';
import { sqlRegion } from '../.tools/plugin-packages/database/shared/sql-intelligence/embedded';
import type { SqlModel } from '../.tools/plugin-packages/database/shared/sql';
import {changesSqlCatalog} from '../.tools/plugin-packages/database/shared/sql';
const model: SqlModel = { label:'fixture', database:'fixture', defaultSchema:'public', searchPath:['public'], schemas:[
 {name:'public',tables:[{name:'users',kind:'table',columns:[{name:'id',type:'integer'},{name:'name',type:'text'},{name:'email',type:'text'}]},{name:'orders',kind:'table',columns:[{name:'id',type:'integer'},{name:'user_id',type:'integer'},{name:'total',type:'numeric'}]},{name:'MixedCase',kind:'table',columns:[{name:'Display Name',type:'text'}]}]},
 {name:'billing',tables:[{name:'users',kind:'table',columns:[{name:'id',type:'integer'},{name:'billing_code',type:'text'}]}]}] };
for(const dialect of ['postgres','mysql','mariadb'] as const) {
 const resolver=createResolver(model,dialect);
 const complete=(sql:string)=>resolver.complete(sql.replace('|',''),sql.indexOf('|'));
 const cols=(sql:string)=>complete(sql).items.filter(i=>i.kind==='column').map(i=>i.label).sort();
 test(`${dialect}: real relations and qualified schemas`,()=>{
  assert(complete('SELECT * FROM us|').items.some(i=>i.label==='users'));
  assert.deepEqual(complete('SELECT * FROM billing.us|').items.map(i=>i.label),['users']);
  assert.deepEqual(cols('SELECT u.| FROM public.users AS u'),['email','id','name']);
  assert.deepEqual(cols('SELECT unknown.| FROM users u'),[]);
  assert.deepEqual(cols('SELECT users.| FROM users u'),[]);
  assert.deepEqual(cols('SELECT billing.users.| FROM public.users'),[]);
 });
 test(`${dialect}: ambiguities and projection isolation`,()=>{
  const r=complete('SELECT | FROM users u JOIN orders o ON o.user_id=u.id');
  assert(r.items.some(i=>i.label==='u.id'&&i.insertText==='u.id'));assert(r.items.some(i=>i.label==='o.id'));
  assert.deepEqual(cols('SELECT d.| FROM (SELECT user_id, SUM(total) AS amount FROM orders GROUP BY user_id) d'),['amount','user_id']);
  assert.deepEqual(cols('SELECT d.| FROM (SELECT * FROM users) d'),['email','id','name']);
  assert.deepEqual(cols('SELECT d.| FROM (SELECT id, email FROM users) AS d(a,b)'),['a','b']);
 });
 test(`${dialect}: CTEs, shadowing and explicit outputs`,()=>{
  assert.deepEqual(cols('WITH people AS (SELECT id, email AS contact FROM users) SELECT p.| FROM people p'),['contact','id']);
  assert.deepEqual(cols('WITH a AS (SELECT email AS contact FROM users), b AS (SELECT contact FROM a) SELECT b.| FROM b'),['contact']);
  assert.deepEqual(cols('WITH users(x) AS (SELECT total FROM orders) SELECT u.| FROM users u'),['x']);
  assert.deepEqual(cols('WITH RECURSIVE tree(id) AS (SELECT id FROM users UNION ALL SELECT id FROM tree) SELECT t.| FROM tree t'),['id']);
  assert.deepEqual(cols('SELECT d.| FROM (SELECT email AS contact FROM users UNION SELECT name FROM users) d'),['contact']);
 });
 test(`${dialect}: nested scope and correlation`,()=>{
  assert.deepEqual(cols('SELECT * FROM users u WHERE EXISTS (SELECT | FROM orders o WHERE o.user_id=u.id)'),['email','name','o.id','total','u.id','user_id'].sort());
  assert.deepEqual(cols('SELECT * FROM users u WHERE EXISTS (SELECT u.| FROM orders u)'),['id','total','user_id']);
  assert.deepEqual(cols('SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM orders o) AND EXISTS (SELECT o.| FROM users p)'),[]);
  assert.deepEqual(cols('SELECT * FROM users u JOIN (SELECT u.| FROM orders o) d ON true'),[]);
  assert.deepEqual(cols('SELECT * FROM users u JOIN LATERAL (SELECT u.|) d ON true'),['email','id','name']);
  assert.deepEqual(cols('SELECT * FROM users u JOIN LATERAL (SELECT o.|) d ON true JOIN orders o ON o.user_id=u.id'),[]);
  assert.deepEqual(cols('SELECT * FROM users u; SELECT u.|'),[]);
 });
 test(`${dialect}: target columns and lexical exclusions`,()=>{
  assert.deepEqual(cols('INSERT INTO users (id, |) VALUES (1,2)'),['email','name']);
  assert.deepEqual(cols('UPDATE users SET | WHERE id=1'),['email','id','name']);
  assert.equal(complete("SELECT 'em|ail' FROM users").items.length,0);
  assert.equal(complete('SELECT -- em|ail\nFROM users').items.length,0);
  assert.equal(complete('SELECT /* em|ail */ id FROM users').items.length,0);
 });
 test(`${dialect}: partial query, mid-token and Unicode ranges`,()=>{
  const query='SELECT /* 😀 */ u.em|ail FROM users u',r=complete(query);
  assert.equal(r.items[0].label,'email');assert.equal(query.replace('|','').slice(r.from,r.to),'email');
  assert(complete('SELECT * FROM us| WHERE (').items.some(i=>i.label==='users'));
 });
}
test('PostgreSQL exact quoted identifiers and search path',()=>{
 const r=createResolver(model,'postgres');const q='SELECT m."Dis|play Name" FROM "MixedCase" m';const c=r.complete(q.replace('|',''),q.indexOf('|'));
 assert.equal(c.items[0]?.insertText,'"Display Name"');assert.equal(q.replace('|','').slice(c.from,c.to),'"Display Name"');
 const other=createResolver({...model,searchPath:['billing','public']},'postgres');const s='SELECT u. FROM users u';assert(other.complete(s,9).items.some(i=>i.label==='billing_code'));
 const upper='SELECT u. FROM users U';assert(r.complete(upper,9).items.some(i=>i.label==='email'));
 const cte='WITH People AS (SELECT email AS Contact FROM users) SELECT p. FROM people p';assert(r.complete(cte,cte.indexOf('p.')+2).items.some(i=>i.label==='contact'));
});
test('MySQL case-sensitive physical table names follow the server setting',()=>{
 const r=createResolver({...model,caseSensitiveTables:true},'mysql');const s='SELECT u. FROM Users u';assert.equal(r.complete(s,9).items.length,0);
});
test('PHP SQL mapping preserves escaped characters and rejects dynamic fragments',()=>{
 const text="<?php $x = 'SELECT \\'😀\\', u.em FROM users u';";const offset=text.indexOf('u.em')+4;
 const region=sqlRegion(text,offset);assert(region&&!region.unsafe);assert.equal(region.boundaries![region.local!],offset);assert(region.sql!.includes("'😀'"));
 assert(sqlRegion('<?php $x="SELECT $name FROM users";',25)?.unsafe);
 assert(sqlRegion("<?php $x='SELECT * FROM users' . $suffix;",20)?.unsafe);
 assert.equal(sqlRegion("<?php $x='hello world';",16),null);
});
test('catalog invalidation follows successful command tokens rather than a leading-text regex',()=>{
 assert(changesSqlCatalog('-- reviewed migration\nALTER TABLE users ADD COLUMN x INT'));
 assert(changesSqlCatalog('/* context */ SET ROLE limited'));
 assert(changesSqlCatalog('SELECT id INTO archive FROM users'));
 assert(!changesSqlCatalog("SELECT 'CREATE TABLE hidden' FROM users"));
});

for(const dialect of ['sqlite','sqlserver','oracle'] as const){
 const upper=dialect==='oracle',fold=(s:string)=>upper?s.toUpperCase():s;
 const schema=upper?'FIXTURE':dialect==='sqlite'?'main':'dbo';
 const m:SqlModel={...model,defaultSchema:schema,searchPath:[schema],schemas:model.schemas.map((s,i)=>({...s,name:i===0?schema:fold(s.name),tables:s.tables.map(t=>({...t,name:fold(t.name),columns:t.columns.map(c=>({...c,name:fold(c.name)}))}))}))};
 const r=createResolver(m,dialect);const run=(q:string)=>r.complete(q.replace('|',''),q.indexOf('|'));
 const cols=(q:string)=>run(q).items.filter(i=>i.kind==='column').map(i=>i.label);
 test(`${dialect}: dialect metadata, projections and lexical boundaries`,()=>{
  assert(cols('SELECT u.| FROM users u').includes(fold('email')));
  assert.deepEqual(cols('WITH people AS (SELECT email AS contact FROM users) SELECT p.| FROM people p'),[fold('contact')]);
  assert.deepEqual(cols('SELECT d.| FROM (SELECT email AS contact FROM users) d'),[fold('contact')]);
  assert.equal(cols('SELECT * FROM users u JOIN (SELECT u.|) d ON 1=1').length,0);
  for(const q of ["SELECT 'em|ail' FROM users",'SELECT -- em|ail\nFROM users','SELECT /* em|ail */ id FROM users'])assert.equal(run(q).items.length,0);
  assert(run(`SELECT * FROM ${schema}.us|`).items.some(i=>i.label===fold('users')));
  assert(!run('SELECT u.| FROM users u').degraded);
  if(dialect!=='sqlite')assert(!run('SELECT id FROM users WHERE id=1 |').items.some(i=>i.kind==='keyword'&&i.label.toUpperCase()==='LIMIT'));
  const unicode='SELECT /* 😀 */ u.em|ail FROM users u',result=run(unicode);
  assert(result.items.some(i=>i.label===fold('email')));assert.equal(unicode.replace('|','').slice(result.from,result.to),'email');
 });
 if(dialect==='sqlserver')test('SQL Server TOP, APPLY, bracket escaping and collation',()=>{
  assert.equal(run('SELECT /* outer /* inner */ em|ail */ id FROM users').items.length,0);
  assert(cols('SELECT fixture.dbo.users.| FROM dbo.users').includes('email'));
  assert.equal(cols('SELECT other.dbo.users.| FROM dbo.users').length,0);
  assert.equal(cols('SELECT u.| FROM fixture.other.dbo.users u').length,0);
  assert.deepEqual(cols('SELECT d.| FROM (SELECT TOP (10) WITH TIES email AS contact FROM users ORDER BY email) d'),['contact']);
  assert(cols('SELECT * FROM users u CROSS APPLY (SELECT u.|) d').includes('email'));
  const q='SELECT m.[Dis|play Name] FROM [MixedCase] m';assert.equal(run(q).items[0]?.insertText,'[Display Name]');
  const sensitive=createResolver({...m,caseSensitiveTables:true},dialect);assert.equal(sensitive.complete('SELECT u. FROM Users u',9).items.length,0);
 });
 if(dialect==='oracle')test('Oracle folded aliases, exact quoting and alternative literals',()=>{
  assert.equal(run('SELECT "u".| FROM USERS "u"').items[0]?.label,'EMAIL');
  assert.equal(run('SELECT u.| FROM USERS "U"').items.length,3);
  assert.equal(run("SELECT q'[em|ail]' FROM users").items.length,0);
  assert.equal(run("SELECT N'em|ail' FROM users").items.length,0);
  assert.equal(run("SELECT q'!em|ail!' FROM users").items.length,0);
  assert.deepEqual(cols('WITH tree(id) AS (SELECT id FROM users UNION ALL SELECT id FROM tree) SELECT t.| FROM tree t'),['ID']);
  assert.deepEqual(cols('SELECT d.| FROM (SELECT email AS contact FROM users MINUS SELECT name FROM users) d'),['CONTACT']);
 });
 if(dialect==='sqlite')test('SQLite accepts all identifier quoting styles',()=>{
  assert.equal(cols('SELECT * FROM users u JOIN LATERAL (SELECT u.|) d ON true').length,0);
  for(const [open,close] of [['"','"'],['`','`'],['[',']']])assert.equal(run(`SELECT m.${open}Dis|play Name${close} FROM ${open}MixedCase${close} m`).items[0]?.label,'Display Name');
 });
}
