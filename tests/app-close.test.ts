import test from 'node:test';
import assert from 'node:assert/strict';
import {protectClose} from '../shared/app-close';

test('closing waits for update completion, serializes duplicate requests and accepts the final native event',async()=>{
 let complete!:()=>void;let apply=0,close=0,prevented=0;
 const handler=protectClose({beforeClose:()=>true,applyUpdate:()=>{apply++;return new Promise<void>(resolve=>complete=resolve);},close:async()=>{close++;},closeWithoutUpdate:()=>false,pending:()=>{},error:()=>{}});
 const event={preventDefault(){prevented++;}};const first=handler(event);await handler(event);assert.equal(apply,1);assert.equal(close,0);
 complete();await first;assert.equal(close,1);await handler(event);assert.equal(close,1);assert.equal(prevented,2);
});
test('a dirty buffer before or during update prevents closing',async()=>{
 let clean=false,apply=0,closed=0;
 const handler=protectClose({beforeClose:()=>clean,applyUpdate:async()=>{apply++;clean=false;},close:async()=>{closed++;},closeWithoutUpdate:()=>false,pending:()=>{},error:()=>{}});
 await handler({preventDefault(){}});assert.equal(apply,0);clean=true;await handler({preventDefault(){}});assert.equal(apply,1);assert.equal(closed,0);
});
test('failed installation can be cancelled or explicitly closed without an update',async()=>{
 let allow=false,closed=0;const states:boolean[]=[];
 const handler=protectClose({beforeClose:()=>true,applyUpdate:async()=>{throw Error('signature or filesystem failure');},close:async()=>{closed++;},closeWithoutUpdate:()=>allow,pending:value=>states.push(value),error:()=>{}});
 await handler({preventDefault(){}});assert.equal(closed,0);allow=true;await handler({preventDefault(){}});assert.equal(closed,1);assert.deepEqual(states,[true,false,true,false]);
});
test('closing without an update waits for the in-app confirmation',async()=>{
 let answer!:(value:boolean)=>void,closed=0;
 const handler=protectClose({beforeClose:()=>true,applyUpdate:async()=>{throw Error('failure');},close:async()=>{closed++;},closeWithoutUpdate:()=>new Promise<boolean>(resolve=>answer=resolve),pending:()=>{},error:()=>{}});
 const pending=handler({preventDefault(){}});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(closed,0);
 answer(true);await pending;assert.equal(closed,1);
});
