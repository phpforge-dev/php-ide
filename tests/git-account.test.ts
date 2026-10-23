import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitService } from '../electron/git';
import type { GitAccountUpdate } from '../shared/contracts';

test('Git accounts: repository isolation, authors, HTTPS, SSH quoting, inheritance, stale writes and remote read',async()=>{
 const temp=await realpath(await mkdtemp(join(tmpdir(),'php-ide-accounts-')));const priorHome=process.env.HOME;const priorXdg=process.env.XDG_CONFIG_HOME;
 const home=join(temp,'home');await mkdir(home);process.env.HOME=home;process.env.XDG_CONFIG_HOME=home;
 const global='[user]\n name = Global Fixture\n email = global@example.invalid\n';await writeFile(join(home,'.gitconfig'),global);
 const a=join(temp,'a'),b=join(temp,'b'),remote=join(temp,'remote.git');await mkdir(a);await mkdir(b);
 const git=(root:string,...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 try {
  for(const root of [a,b])git(root,'init','-q','-b','main');git(temp,'init','--bare','-q',remote);git(a,'remote','add','origin',remote);
  const first=new GitService(a),second=new GitService(b);const originalB=await readFile(join(b,'.git/config'),'utf8');
  const input=async(service:GitService,name:string,email:string):Promise<GitAccountUpdate>=>({token:(await service.account()).token,identity:'local',name,email,authentication:'keep',username:'',sshKey:''});
  assert.equal((await first.account()).name,'Global Fixture');
  const changed=await first.saveAccount({...await input(first,'Empresa','empresa@example.invalid'),authentication:'https',username:'empresa-user'});
  assert.equal(changed.username,'empresa-user');assert.equal(git(a,'config','credential.useHttpPath'),'true');
  assert.equal(await readFile(join(b,'.git/config'),'utf8'),originalB);assert.equal(await readFile(join(home,'.gitconfig'),'utf8'),global);
  await second.saveAccount(await input(second,'Pessoal','pessoal@example.invalid'));
  for(const [root,service,email] of [[a,first,'empresa@example.invalid'],[b,second,'pessoal@example.invalid']] as const){git(root,'commit','--allow-empty','-qm','Identity fixture');assert.equal(git(root,'log','-1','--format=%ae'),email);assert.equal((await service.account()).email,email);}
  const helper=join(temp,'helper');const captured=join(temp,'credential-context');
  await writeFile(helper,`#!/usr/bin/env node\nlet text='';process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>{require('fs').writeFileSync(${JSON.stringify(captured)},text);console.log('password=synthetic-fixture');});`,{mode:0o755});
  git(a,'config','credential.helper',helper);
  execFileSync('git',['-C',a,'credential','fill'],{encoding:'utf8',input:'protocol=https\nhost=example.invalid\npath=company/repo.git\n\n'});
  const context=await readFile(captured,'utf8');assert.match(context,/username=empresa-user/);assert.match(context,/path=company\/repo.git/);
  const stale=await input(first,'Stale','stale@example.invalid');git(a,'config','test.external','preserved');await assert.rejects(first.saveAccount(stale),/mudou/);assert.equal(git(a,'config','test.external'),'preserved');
  const key=join(temp,"key ' quoted $(not-executed)");await writeFile(key,'synthetic key path only');
  const ssh=await first.saveAccount({...await input(first,'Empresa','empresa@example.invalid'),authentication:'ssh',sshKey:key});assert.equal(ssh.sshKey,key);assert.equal(ssh.username,'');
  const bin=join(temp,'bin');await mkdir(bin);await writeFile(join(bin,'ssh'),'#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)))',{mode:0o755});
  const args=JSON.parse(execFileSync('sh',['-c',git(a,'config','core.sshCommand')],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH}}));assert.equal(args.at(-1),key);assert.ok(args.includes('IdentitiesOnly=yes'));
  assert.match(await first.testAccount('origin',ssh.token),/Leitura do remoto/);assert.equal(git(remote,'for-each-ref'),'');
  await assert.rejects(first.testAccount('missing',ssh.token),/remoto existente/);
  const inherited=await first.saveAccount({...await input(first,'',''),identity:'inherit',authentication:'inherit'});assert.equal(inherited.name,'Global Fixture');assert.equal(inherited.sshKey,'');assert.equal((await second.account()).name,'Pessoal');
  const before=await readFile(join(a,'.git/config'),'utf8');await assert.rejects(first.saveAccount({...await input(first,'Bad\nName','bad@example.invalid')}),/inválido/);assert.equal(await readFile(join(a,'.git/config'),'utf8'),before);
  await writeFile(join(a,'.git/config.lock'),'external lock');await assert.rejects(first.saveAccount(await input(first,'Blocked','blocked@example.invalid')));assert.equal(await readFile(join(a,'.git/config.lock'),'utf8'),'external lock');await rm(join(a,'.git/config.lock'));
  git(a,'remote','set-url','origin','https://user:fixture-secret@example.invalid/team/repo.git');assert.ok(!JSON.stringify(await first.account()).includes('fixture-secret'));
  assert.equal(await readFile(join(home,'.gitconfig'),'utf8'),global);
 } finally { if(priorHome===undefined)delete process.env.HOME;else process.env.HOME=priorHome;if(priorXdg===undefined)delete process.env.XDG_CONFIG_HOME;else process.env.XDG_CONFIG_HOME=priorXdg;await rm(temp,{recursive:true,force:true}); }
});
