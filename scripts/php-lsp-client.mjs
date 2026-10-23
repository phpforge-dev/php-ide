// Cliente LSP mínimo para ensaiar o mesmo Phpactor e a mesma configuração usados
// por src-tauri/src/language.rs, sem abrir a janela Tauri. Só para testes.
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export async function startPhpactor(root,{phar,cache,php=process.env.PHP_IDE_PHP_BIN??'php',timeout=90000,config={}}){
 const child=spawn(php,[phar,'language-server',`--config-extra=${JSON.stringify({'indexer.enabled_watchers':['lsp'],'indexer.include_patterns':['/**/*.php'],...config})}`],{cwd:root,env:{...process.env,XDG_CACHE_HOME:cache},stdio:['pipe','pipe','pipe']});
 let buffer=Buffer.alloc(0),id=0;const pending=new Map();let indexed;const ready=new Promise(r=>indexed=r);let token=null;
 child.stderr.on('data',()=>{});
 child.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);for(;;){const head=buffer.indexOf('\r\n\r\n');if(head<0)return;const length=Number(/Content-Length: (\d+)/i.exec(buffer.slice(0,head).toString())?.[1]);if(buffer.length<head+4+length)return;const message=JSON.parse(buffer.slice(head+4,head+4+length).toString());buffer=buffer.slice(head+4+length);
  if(message.id!==undefined&&message.method){send({jsonrpc:'2.0',id:message.id,result:message.method==='workspace/configuration'?(message.params?.items??[]).map(()=>null):null});continue;}
  if(message.id!==undefined){const p=pending.get(message.id);pending.delete(message.id);p?.(message);continue;}
  if(message.method==='$/progress'){const v=message.params.value;if(v.kind==='begin'&&v.title==='Indexing workspace')token=message.params.token;if(v.kind==='end'&&token!==null&&token===message.params.token)indexed();}
 }});
 const send=m=>{const body=Buffer.from(JSON.stringify(m));child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);child.stdin.write(body);};
 const request=(method,params,ms=30000)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error(`${method} timeout`));},ms);pending.set(n,m=>{clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result);});send({jsonrpc:'2.0',id:n,method,params});});
 const notify=(method,params)=>send({jsonrpc:'2.0',method,params});
 const uri=pathToFileURL(root).href;
 await request('initialize',{processId:process.pid,rootUri:uri,workspaceFolders:[{uri,name:'fixture'}],capabilities:{window:{workDoneProgress:true},workspace:{configuration:true,didChangeWatchedFiles:{dynamicRegistration:true}},general:{positionEncodings:['utf-16']},textDocument:{completion:{completionItem:{snippetSupport:true,labelDetailsSupport:true}},definition:{linkSupport:true},hover:{contentFormat:['markdown','plaintext']}}}},60000);
 notify('initialized',{});
 await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Indexação excedeu o limite')),timeout))]);
 const versions=new Map();
 return {
  request,notify,
  open(path,text){const u=pathToFileURL(path).href;const v=(versions.get(u)??0)+1;notify(v===1?'textDocument/didOpen':'textDocument/didChange',v===1?{textDocument:{uri:u,languageId:'php',version:v,text}}:{textDocument:{uri:u,version:v},contentChanges:[{text}]});versions.set(u,v);return u;},
  stop(){child.kill();},
 };
}
