// Testa push/pull/fetch do backend Rust contra um servidor Git descartável (sshd + git-http-backend com TLS).
// Chaves, certificado, usuário e senha são gerados aqui; o container e a pasta temporária são removidos no fim.
import {execFileSync,spawnSync} from 'node:child_process';import {mkdtemp,writeFile,readFile,rm,chmod,mkdir} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
const run=(file,args,opts={})=>execFileSync(file,args,{encoding:'utf8',...opts}).trim();
const image='php-ide-test-git-server:2';
const temp=await mkdtemp(join(tmpdir(),'php-ide-git-remote-'));const fixture=join(temp,'fixture');await mkdir(fixture);
const name=`php-ide-git-test-${Date.now()}`;let created=false;
try{
 run('docker',['build','-q','-t',image,'-'],{input:'FROM alpine:3.20\nRUN apk add --no-cache git git-daemon openssh-server lighttpd lighttpd-mod_auth openssl\n',timeout:300000});
 const key=join(temp,'id_ed25519');run('ssh-keygen',['-q','-t','ed25519','-N','','-C','php-ide-test','-f',key]);
 const user='phpide';const password=randomBytes(18).toString('base64url');
 await writeFile(join(fixture,'authorized_keys'),await readFile(key+'.pub','utf8'));
 // Senha só no servidor descartável; o cliente a recebe por variável de ambiente.
 await writeFile(join(fixture,'users'),`${user}:${password}\n`);
 await writeFile(join(fixture,'lighttpd.conf'),`server.modules = ("mod_auth","mod_alias","mod_setenv","mod_authn_file","mod_cgi","mod_openssl")
server.document-root = "/var/www"
server.port = 8443
server.username = "git"
server.groupname = "git"
ssl.engine = "enable"
ssl.pemfile = "/tmp/server.pem"
auth.backend = "plain"
auth.backend.plain.userfile = "/fixture/users"
alias.url = ("/git" => "/usr/libexec/git-core/git-http-backend")
$HTTP["url"] =~ "^/git" {
  cgi.assign = ("" => "")
  setenv.set-environment = ("GIT_PROJECT_ROOT" => "/srv/git", "GIT_HTTP_EXPORT_ALL" => "1")
  auth.require = ("" => ("method" => "basic", "realm" => "git", "require" => "valid-user"))
}
`);
 await writeFile(join(fixture,'entry.sh'),`set -e
ssh-keygen -A >/dev/null
adduser -D -h /srv/git -s /usr/bin/git-shell git
sed -i 's/^git:!/git:*/' /etc/shadow
mkdir -p /srv/git/.ssh /var/www
cp /fixture/authorized_keys /srv/git/.ssh/authorized_keys
chmod 700 /srv/git/.ssh && chmod 600 /srv/git/.ssh/authorized_keys
git init -q --bare -b main /srv/git/project.git
git -C /srv/git/project.git config http.receivepack true
chown -R git:git /srv/git
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" -keyout /tmp/key.pem -out /tmp/cert.pem 2>/dev/null
cat /tmp/key.pem /tmp/cert.pem > /tmp/server.pem && chown git /tmp/server.pem
/usr/sbin/sshd -e -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o PermitRootLogin=no -o AllowUsers=git
touch /tmp/ready
exec lighttpd -D -f /fixture/lighttpd.conf
`);
 run('docker',['create','--name',name,'--label','php-ide.test=true','-p','127.0.0.1::22','-p','127.0.0.1::8443',image,'sh','/fixture/entry.sh']);created=true;
 run('docker',['cp',fixture+'/.',`${name}:/fixture`]);run('docker',['start',name]);
 let ready=false;for(let i=0;i<60&&!ready;i++){try{run('docker',['exec',name,'test','-f','/tmp/ready'],{stdio:['ignore','pipe','ignore']});ready=true;}catch{await new Promise(r=>setTimeout(r,500));}}
 if(!ready)throw Error('Servidor Git não iniciou: '+spawnSync('docker',['logs',name],{encoding:'utf8'}).stderr);
 const port=p=>Number(run('docker',['port',name,p]).split('\n')[0].split(':').at(-1));const sshPort=port('22');const httpsPort=port('8443');
 const ca=join(temp,'ca.pem');run('docker',['cp',`${name}:/tmp/cert.pem`,ca]);
 const knownHosts=join(temp,'known_hosts');await writeFile(knownHosts,`[127.0.0.1]:${sshPort} ${run('docker',['exec',name,'cat','/etc/ssh/ssh_host_ed25519_key.pub']).split(' ').slice(0,2).join(' ')}\n`);
 // Helper de credencial de teste: lê a senha do ambiente; "wrong" devolve senha incorreta.
 const helper=join(temp,'credential-helper.sh');
 await writeFile(helper,'#!/bin/sh\nfor op; do :; done\n[ "$op" = get ] || exit 0\nif [ "$1" = wrong ]; then echo "password=wrong-$PHP_IDE_TEST_GIT_PASSWORD"; else echo "password=$PHP_IDE_TEST_GIT_PASSWORD"; fi\n');await chmod(helper,0o700);
 for(let i=0;i<20;i++){try{run('curl',['-sf','--cacert',ca,'-u',`${user}:${password}`,`https://127.0.0.1:${httpsPort}/git/project.git/info/refs?service=git-upload-pack`],{stdio:['ignore','pipe','ignore']});break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const remotes={ssh:`ssh://git@127.0.0.1:${sshPort}/srv/git/project.git`,https:`https://127.0.0.1:${httpsPort}/git/project.git`,key,knownHosts,ca,user};
 const filter=process.argv[2]??'git::scenarios::live_';
 const result=spawnSync(join(homedir(),'.cargo','bin','cargo'),['test','--manifest-path','src-tauri/Cargo.toml',filter,'--','--ignored','--nocapture','--test-threads=1'],{stdio:'inherit',env:{...process.env,PHP_IDE_TEST_GIT_REMOTES:JSON.stringify(remotes),PHP_IDE_TEST_GIT_PASSWORD:password,PHP_IDE_TEST_GIT_HELPER:helper}});
 if(result.status!==0){console.error(run('docker',['logs','--tail','40',name],{stdio:['ignore','pipe','pipe']}));}
 process.exitCode=result.status??1;
}catch(e){console.error(e);process.exitCode=1;}finally{if(created){try{run('docker',['rm','-f',name],{timeout:15000});}catch{}}await rm(temp,{recursive:true,force:true});}
