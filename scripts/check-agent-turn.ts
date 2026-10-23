import { Agent } from '../electron/agent';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
let answer='';let finish!:()=>void;let fail!:(error:Error)=>void;
const done=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject;});
const agent=new Agent(resolve('fixtures/php-intelligence'),event=>{
 if(event.type!=='agent')return;
 answer+=event.text;
 if(event.done){if(event.error)fail(new Error(event.text));else finish();}
});
const timer=setTimeout(()=>fail(new Error('Resposta excedeu 90 segundos')),90000);
try {
 await agent.ask('Responda apenas PHP_IDE_OK. Não use ferramentas nem leia arquivos.');
 await done;assert.match(answer,/PHP_IDE_OK/);
 console.log('Streaming e conclusão de resposta: OK');
}finally{clearTimeout(timer);agent.dispose();}
