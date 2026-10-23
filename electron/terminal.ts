import * as pty from 'node-pty';
import { basename, isAbsolute } from 'node:path';
import type { TerminalEvent } from '../shared/contracts';
export class TerminalService {
 private sessions=new Map<string,{pty:pty.IPty;pending:number;paused:boolean}>();
 constructor(private root:string,private send:(event:TerminalEvent)=>void,private shell=process.platform==='win32'?'powershell.exe':process.env.SHELL||'/bin/sh') {}
 private dimensions(cols:number,rows:number){if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||cols>500||rows<1||rows>300)throw new Error('Dimensões do terminal inválidas.');}
 create(id:string,cols:number,rows:number){
  this.dimensions(cols,rows);if(!/^[a-f0-9-]{36}$/.test(id)||this.sessions.has(id))throw new Error('Sessão inválida.');if(this.sessions.size>=8)throw new Error('Limite de oito terminais ativos. Encerre uma sessão.');
  if(process.platform!=='win32'&&!isAbsolute(this.shell))throw new Error('O shell deve ter caminho absoluto.');
  const env={...process.env,TERM:'xterm-256color',COLORTERM:'truecolor'};delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
  const terminal=pty.spawn(this.shell,process.platform==='win32'?['-NoLogo']:['-l'],{cwd:this.root,cols,rows,name:'xterm-256color',env});
  const session={pty:terminal,pending:0,paused:false};this.sessions.set(id,session);
  terminal.onData(data=>{session.pending+=data.length;if(session.pending>262144&&!session.paused){terminal.pause();session.paused=true;}this.send({type:'output',id,data});});
  terminal.onExit(event=>{if(this.sessions.get(id)!==session)return;this.sessions.delete(id);this.send({type:'exit',id,code:event.exitCode});});
  return {shell:basename(this.shell)};
 }
 write(id:string,data:string){const session=this.sessions.get(id);if(!session)throw new Error('Sessão encerrada.');if(typeof data!=='string'||data.length>65536)throw new Error('Entrada do terminal excede o limite.');session.pty.write(data);}
 resize(id:string,cols:number,rows:number){this.dimensions(cols,rows);this.sessions.get(id)?.pty.resize(cols,rows);}
 ack(id:string,size:number){const session=this.sessions.get(id);if(!session)return;if(!Number.isInteger(size)||size<0||size>session.pending)throw new Error('Confirmação inválida.');session.pending-=size;if(session.paused&&session.pending<65536){session.paused=false;session.pty.resume();}}
 close(id:string){const session=this.sessions.get(id);if(!session)return;this.sessions.delete(id);try{session.pty.kill();}catch{/* Process may have exited before its event was delivered. */}this.send({type:'exit',id,code:-1});}
 dispose(){for(const id of [...this.sessions.keys()])this.close(id);}
}
