// Recorte 26: Oracle Free, Redis 7 e Redis 7 com TLS (CA próprio) em containers descartáveis
// criados e removidos aqui; executa o teste live_fixtures do backend Rust.
import {execFileSync,spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';import {homedir,tmpdir} from 'node:os';import {join} from 'node:path';
const run=(cmd,args,opts={})=>execFileSync(cmd,args,{encoding:'utf8',...opts}).trim();
const docker=args=>run('docker',args);
const only=process.argv.slice(2);
const certs=mkdtempSync(join(tmpdir(),'php-ide-redis-tls-'));
const openssl=args=>run('openssl',args,{cwd:certs,stdio:['ignore','pipe','pipe']});
openssl(['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-subj','/CN=PHP IDE fixture CA','-keyout','ca.key','-out','ca.crt']);
openssl(['req','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout','server.key','-out','server.csr']);
writeFileSync(join(certs,'san.ext'),'subjectAltName=IP:127.0.0.1,DNS:localhost\n');
openssl(['x509','-req','-in','server.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-days','2','-extfile','san.ext','-out','server.crt']);
for(const f of ['server.key','server.crt','ca.crt'])chmodSync(join(certs,f),0o644);
const fixtures=[
 ['oracle','gvenzl/oracle-free:23-slim-faststart',1521,['ORACLE_PASSWORD=fixture-admin','APP_USER=fixture','APP_USER_PASSWORD=fixture'],{database:'FREEPDB1',user:'fixture',connectType:'service'}],
 ['redis','redis:7-alpine',6379,[],{database:'0',user:'',password:'fixture'},[],['redis-server','--requirepass','fixture']],
 ['redis-tls','redis:7-alpine',6379,[],{driver:'redis',database:'0',user:'',password:'fixture',ssl:{mode:'verify-full',ca:join(certs,'ca.crt')}},['-v',`${certs}:/tls:ro`],['redis-server','--port','0','--tls-port','6379','--tls-cert-file','/tls/server.crt','--tls-key-file','/tls/server.key','--tls-ca-cert-file','/tls/ca.crt','--tls-auth-clients','no','--requirepass','fixture']],
].filter(f=>!only.length||only.includes(f[0]));
const owned=[];const inputs=[];
try{
 for(const [driver,image,port,env,extra,flags=[],command=[]] of fixtures){
  const name=`php-ide-db-test-${driver}-${Date.now()}`;
  docker(['run','--rm','-d','--name',name,...flags,'-p',`127.0.0.1::${port}`,...env.flatMap(v=>['-e',v]),image,...command]);owned.push(name);
  inputs.push({driver,host:'127.0.0.1',port:Number(docker(['port',name,String(port)]).split('\n')[0].split(':').at(-1)),password:'fixture',...extra});
 }
 const result=spawnSync(join(homedir(),'.cargo','bin','cargo'),['test','--manifest-path','src-tauri/Cargo.toml','live_fixtures','--','--ignored','--nocapture'],{stdio:'inherit',env:{...process.env,PHP_IDE_TEST_DATABASES:JSON.stringify(inputs)}});
 process.exitCode=result.status??1;
}finally{for(const name of owned){try{docker(['rm','-f',name]);}catch{}}rmSync(certs,{recursive:true,force:true});}
