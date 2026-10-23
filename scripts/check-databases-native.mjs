// Testa o backend Rust de bancos contra containers descartáveis criados e removidos aqui.
import {execFileSync,spawnSync} from 'node:child_process';import {homedir} from 'node:os';import {join} from 'node:path';
const run=(args,opts={})=>execFileSync('docker',args,{encoding:'utf8',...opts}).trim();
const only=process.argv.slice(2);
const fixtures=[
 ['postgres','postgres:16',5432,['POSTGRES_PASSWORD=fixture','POSTGRES_DB=fixture'],{database:'fixture',user:'postgres'}],
 ['mysql','mysql:8.4',3306,['MYSQL_ROOT_PASSWORD=fixture','MYSQL_DATABASE=fixture'],{database:'fixture',user:'root'}],
 ['mariadb','mariadb:11.4',3306,['MARIADB_ROOT_PASSWORD=fixture','MARIADB_DATABASE=fixture'],{database:'fixture',user:'root'}],
 ['sqlserver','mcr.microsoft.com/mssql/server:2022-latest',1433,['ACCEPT_EULA=Y','MSSQL_SA_PASSWORD=Fixture#2026'],{database:'master',user:'sa',password:'Fixture#2026',ssl:{mode:'require'}},['--platform','linux/amd64']],
 ['redis','redis:7-alpine',6379,[],{database:'0',user:'',password:'fixture'},[],['redis-server','--requirepass','fixture']],
].filter(f=>!only.length||only.includes(f[0]));
const owned=[];const inputs=[];
try{
 for(const [driver,image,port,env,extra,flags=[],command=[]] of fixtures){
  const name=`php-ide-db-test-${driver}-${Date.now()}`;
  run(['run','--rm','-d','--name',name,...flags,'-p',`127.0.0.1::${port}`,...env.flatMap(v=>['-e',v]),image,...command]);owned.push(name);
  inputs.push({driver,host:'127.0.0.1',port:Number(run(['port',name,String(port)]).split('\n')[0].split(':').at(-1)),password:'fixture',...extra});
 }
 const result=spawnSync(join(homedir(),'.cargo','bin','cargo'),['test','--manifest-path','src-tauri/Cargo.toml','live_fixtures','--','--ignored','--nocapture'],{stdio:'inherit',env:{...process.env,PHP_IDE_TEST_DATABASES:JSON.stringify(inputs)}});
 process.exitCode=result.status??1;
}finally{for(const name of owned){try{run(['rm','-f',name]);}catch{}}}
