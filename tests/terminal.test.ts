import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TerminalService } from '../electron/terminal';
test('Terminal PTY lifecycle, dimensions and closed-session refusal',async()=>{
 let output='';let exited=false;const id=randomUUID();
 const service=new TerminalService(process.cwd(),e=>{if(e.type==='output'){output+=e.data;service.ack(id,e.data.length);}else exited=true;},'/bin/sh');
 try {
  assert.throws(()=>service.create(id,0,24),/Dimensões/);service.create(id,80,24);service.resize(id,91,31);service.write(id,"stty size; printf 'PTY_%s\n' READY\r");
  const end=Date.now()+5000;while(!output.includes('PTY_READY')&&Date.now()<end)await new Promise(r=>setTimeout(r,20));
  assert.match(output,/PTY_READY/);assert.match(output,/31 91/);service.dispose();assert.ok(exited);assert.throws(()=>service.write(id,'x'),/encerrada/);service.dispose();
 }finally{service.dispose();}
});
