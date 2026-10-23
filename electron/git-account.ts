import { lstat, readFile, open, rename, rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { GitAccount, GitAccountUpdate } from '../shared/contracts';
type Command = (args: string[]) => Promise<string>;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const ssh = (path: string) => `ssh -o BatchMode=yes -o IdentitiesOnly=yes -i ${quote(path)}`;
export class GitAccountService {
 constructor(private root: string, private command: Command) {}
 private async get(key: string, local = false) {
  try { return (await this.command(['config', ...(local ? ['--local', '--no-includes'] : ['--includes']), '--get', key])).trimEnd(); }
  catch(error: any) { if(error.code===1)return null;throw error; }
 }
 private async config() {
  const path=resolve(this.root,(await this.command(['rev-parse','--git-path','config'])).trim());
  if(!(await lstat(path)).isFile())throw new Error('Configuração Git deve ser um arquivo regular, sem link simbólico.');
  const text=await readFile(path,'utf8');return {path,text,token:hash(this.root+'\0'+text)};
 }
 private display(url: string) {
  // Never send embedded HTTP credentials to the renderer.
  return url.replace(/(https?:\/\/)[^/@\s]+@/gi,'$1[credencial omitida]@').replace(/[?#].*$/,'');
 }
 async read(): Promise<GitAccount> {
  const config=await this.config();
  const values=await Promise.all(['user.name','user.email','credential.username','phpide.sshKey','core.sshCommand','credential.helper'].map(k=>this.get(k)));
  const author=await this.command(['var','GIT_AUTHOR_IDENT']).catch(()=> '');
  const identity=author.match(/^(.*) <([^>]*)> \d+ [+-]\d+\s*$/);
  const names=(await this.command(['remote'])).trim().split('\n').filter(Boolean);
  const remotes=[];
  for(const name of names)remotes.push({name,fetch:this.display((await this.command(['remote','get-url','--',name])).trim()),push:this.display((await this.command(['remote','get-url','--push','--',name])).trim())});
  return {token:config.token,name:identity?.[1]??values[0]??'',email:identity?.[2]??values[1]??'',localName:await this.get('user.name',true),localEmail:await this.get('user.email',true),username:values[2]??'',sshKey:values[3]&&values[4]===ssh(values[3])?values[3]:'',sshConfigured:!!values[4],helperConfigured:!!values[5],remotes};
 }
 async save(input: GitAccountUpdate) {
  if(!input||!['local','inherit'].includes(input.identity)||!['keep','https','ssh','inherit'].includes(input.authentication))throw new Error('Configuração inválida.');
  for(const value of [input.name,input.email,input.username,input.sshKey])if(typeof value!=='string'||value.length>4096||/[\0\r\n]/.test(value))throw new Error('Campo inválido.');
  if(input.identity==='local'&&(!input.name.trim()||!/^\S+@\S+$/.test(input.email)||/[<>]/.test(input.name+input.email)))throw new Error('Informe nome e e-mail válidos para os commits.');
  if(input.authentication==='https'&&(!input.username.trim()||/[:@\s]/.test(input.username)))throw new Error('Informe o usuário HTTPS, sem senha ou token.');
  if(input.authentication==='ssh'&&(!isAbsolute(input.sshKey)||!(await lstat(input.sshKey)).isFile()))throw new Error('Selecione o caminho absoluto de uma chave SSH existente.');
  const config=await this.config();if(config.token!==input.token)throw new Error('Configuração mudou. Feche e reabra o painel antes de salvar.');
  const lock=config.path+'.lock';const handle=await open(lock,'wx',(await lstat(config.path)).mode & 0o777);
  try {
   await handle.writeFile(config.text);await handle.close();
   const set=async(key:string,value:string|null)=>{try{await this.command(['config','--file',lock,value===null?'--unset-all':'--replace-all',key,...(value===null?[]:[value])]);}catch(error:any){if(value!==null||error.code!==5)throw error;}};
   await set('user.name',input.identity==='local'?input.name.trim():null);await set('user.email',input.identity==='local'?input.email.trim():null);
   if(input.authentication!=='keep') {
    await set('core.sshCommand',input.authentication==='ssh'?ssh(input.sshKey):null);
    await set('phpide.sshKey',input.authentication==='ssh'?input.sshKey:null);
    await set('credential.username',input.authentication==='https'?input.username.trim():null);
    await set('credential.useHttpPath',input.authentication==='https'?'true':null);
   }
   if((await this.config()).token!==input.token)throw new Error('Configuração mudou durante a gravação. Tente novamente.');
   await rename(lock,config.path);
  } finally {await handle.close().catch(()=>{});await rm(lock,{force:true});}
  return this.read();
 }
 async test(remote: string, token: string) {
  const state=await this.read();if(state.token!==token)throw new Error('Configuração mudou. Reabra o painel antes de testar.');
  if(!state.remotes.some(r=>r.name===remote)||remote.startsWith('-'))throw new Error('Selecione um remoto existente.');
  try {await this.command(['-c','core.sshCommand='+(await this.get('core.sshCommand')??'ssh')+' -o BatchMode=yes','ls-remote','--',remote]);}
  catch {throw new Error('Não foi possível ler o remoto. Confira URL, rede, credenciais do sistema e SSH Agent/known_hosts. Nenhuma alteração foi enviada.');}
  return 'Leitura do remoto concluída. Isso não comprova permissão de push nem a identidade da conta (remotos públicos podem aceitar acesso anônimo).';
 }
}
