import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { inspectConnection, DatabaseBrowser } from '../electron/database';
import type { ConnectionInput } from '../shared/contracts';
const exec=promisify(execFile);
for(const profile of ['postgres','mysql','mariadb'] as const){
 const driver = profile === 'postgres' ? 'postgres' : 'mysql';
 const name=`php-ide-test-${randomUUID()}`;
 const port=driver==='postgres'?5432:3306;
 try{
  await exec('docker',['run','--rm','-d','--name',name,'-p',`127.0.0.1::${port}`,...(driver==='postgres'?['-e','POSTGRES_PASSWORD=fixture','-e','POSTGRES_DB=fixture','postgres:16']:['-e','MYSQL_ROOT_PASSWORD=fixture','-e','MYSQL_DATABASE=fixture',profile === 'mariadb' ? 'mariadb:11.4' : 'mysql:8.4'])]);
  const mapping=(await exec('docker',['port',name,String(port)])).stdout.trim();
  const input: ConnectionInput={driver,host:'127.0.0.1',port:Number(mapping.split(':').at(-1)),database:'fixture',user:driver==='postgres'?'postgres':'root',password:'fixture',tls:false};
  let result:Awaited<ReturnType<typeof inspectConnection>>|undefined;
  let failure:unknown;
  for(let i=0;i<45;i++){try{result=await inspectConnection(input);break;}catch(error){failure=error;await new Promise(resolve=>setTimeout(resolve,1000));}}
  if(!result)throw failure;
  assert.ok(result.schemas.includes(driver==='postgres'?'public':'fixture'));
  await assert.rejects(inspectConnection({...input,password:'wrong-password'}));
  const schema = driver === 'postgres' ? 'public' : 'fixture';
  const sql = "CREATE TABLE people (id INTEGER PRIMARY KEY, name VARCHAR(60), notes VARCHAR(1000)); INSERT INTO people (id,name,notes) VALUES " + Array.from({length:55},(_,i)=>`(${i+1}, 'Pessoa ${i+1}', ${i === 0 ? 'NULL' : "'" + 'x'.repeat(600) + "'"})`).join(',') + ';';
  await exec('docker',['exec',name,...(driver === 'postgres' ? ['psql','-U','postgres','-d','fixture','-c',sql] : [profile === 'mariadb' ? 'mariadb' : 'mysql','-uroot','-pfixture','fixture','-e',sql])]);
  const browser = new DatabaseBrowser(); const session = await browser.connect(input);
  assert.ok(!JSON.stringify(session).includes('password'));
  assert.ok((await browser.tables(session.id,schema)).some(t=>t.name==='people'));
  const first=await browser.page(session.id,schema,'people',0); assert.equal(first.rows.length,50); assert.equal(first.rows[0][0],'1'); assert.equal(first.rows[0][2],null); assert.equal(first.rows[1][2]?.length,513); assert.equal(first.columns[0].primary,true); assert.equal(first.hasMore,true);
  const second=await browser.page(session.id,schema,'people',50); assert.equal(second.rows.length,5); assert.equal(second.rows[0][0],'51'); assert.equal(second.hasMore,false);
  await assert.rejects(browser.page(session.id,schema,'people; DROP TABLE people',0));
  await assert.rejects(browser.page(session.id,schema,'people',-1));
  assert.equal((await browser.page(session.id,schema,'people',0)).rows.length,50);
  browser.disconnect(session.id); await assert.rejects(browser.tables(session.id,schema));
  console.log(`${profile}: conexão, schemas, tabelas, metadados, paginação, NULL, truncamento, entradas inválidas e desconexão OK`);
 }finally{await exec('docker',['rm','-f',name]).catch(()=>{});}
}
