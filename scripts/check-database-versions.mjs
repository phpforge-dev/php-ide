// Matriz de versões de banco suportadas: executa o teste Rust `live_fixtures` contra containers descartáveis,
// uma versão por vez (memória limitada), e o teste SQLite embutido. Uso: node scripts/check-database-versions.mjs [postgres:13 ...]
import {execFileSync,spawnSync} from 'node:child_process';import {homedir} from 'node:os';import {join} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';
const run=(args,opts={})=>execFileSync('docker',args,{encoding:'utf8',...opts}).trim();
const cargo=(args,env={})=>spawnSync(join(homedir(),'.cargo','bin','cargo'),['test','--manifest-path','src-tauri/Cargo.toml',...args],{encoding:'utf8',env:{...process.env,...env}});
const pg=image=>['postgres',image,5432,['POSTGRES_PASSWORD=fixture','POSTGRES_DB=fixture'],{database:'fixture',user:'postgres'}];
const my=image=>['mysql',image,3306,['MYSQL_ROOT_PASSWORD=fixture','MYSQL_DATABASE=fixture'],{database:'fixture',user:'root'}];
const maria=image=>['mariadb',image,3306,['MARIADB_ROOT_PASSWORD=fixture','MARIADB_DATABASE=fixture'],{database:'fixture',user:'root'}];
// MySQL 5.7 só publica imagem amd64: no Apple Silicon roda emulado (lento).
const matrix=[pg('postgres:13'),pg('postgres:16'),pg('postgres:17'),[...my('mysql:5.7'),['--platform','linux/amd64']],my('mysql:8.4'),maria('mariadb:10.6'),maria('mariadb:11.4')];
const pull=process.argv.includes('--pull');const only=process.argv.slice(2).filter(a=>a!=='--pull');const selected=matrix.filter(f=>!only.length||only.includes(f[1]));
const results=[];
for(const [driver,image,port,env,extra,flags=[]] of selected){
 const name=`php-ide-dbver-test-${driver}-${Date.now()}`;let owned=false;const started=Date.now();
 try{
  // Pull explícito (com limite) para não confundir download lento com banco travado.
  // Sem a imagem local, só baixa com --pull (registro pode estar inacessível; evita travar a matriz).
  if(!run(['images','-q',image],{timeout:30000})){if(!pull)throw Error(`imagem ${image} ausente; rode com --pull`);console.log(`pull ${image}…`);run(['pull',...flags,image],{timeout:900000,stdio:['ignore','ignore','inherit']});}
  run(['run','--rm','-d','--name',name,'--label','php-ide.test=true',...flags,'-p',`127.0.0.1::${port}`,...env.flatMap(v=>['-e',v]),image],{timeout:600000});owned=true;
  const input={driver,host:'127.0.0.1',port:Number(run(['port',name,String(port)]).split('\n')[0].split(':').at(-1)),password:'fixture',tls:false,...extra};
  const r=cargo(['database::tests::live_fixtures','--','--ignored','--nocapture','--exact'],{PHP_IDE_TEST_DATABASES:JSON.stringify([input])});
  const ok=r.status===0&&/1 passed/.test(r.stdout);
  results.push({image,ok,seconds:Math.round((Date.now()-started)/1000),detail:ok?'':(r.stdout+r.stderr).split('\n').filter(l=>/panicked|assert|Error|error:/.test(l)).slice(0,8).join('\n')});
 }catch(e){results.push({image,ok:false,seconds:Math.round((Date.now()-started)/1000),detail:String(e.message??e).slice(0,600)});}
 finally{if(owned){try{run(['rm','-f',name],{timeout:30000});}catch{}}}
 console.log(`${results.at(-1).ok?'OK  ':'FAIL'} ${image} (${results.at(-1).seconds}s)${results.at(-1).detail?'\n'+results.at(-1).detail:''}`);
}
if(!only.length||only.includes('sqlite')){
 const r=cargo(['database::tests::sqlite_browse_page_and_ddl','--','--exact']);const ok=r.status===0&&/1 passed/.test(r.stdout);
 results.push({image:'sqlite (sqlx embutido)',ok,seconds:0,detail:ok?'':r.stdout.slice(-800)});console.log(`${ok?'OK  ':'FAIL'} sqlite (sqlx embutido)`);
}
await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/database-versions.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
