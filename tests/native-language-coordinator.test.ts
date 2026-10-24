import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeLanguage} from '../src/native-language';
import {setExternalPlugins} from '../shared/language/plugins/host';
import {providePluginService} from '../src/plugin-services';
const input={method:'textDocument/completion' as const,path:'a.php',text:'<?php new A',version:1,position:{line:0,character:11}};
const transport=async(method:string)=>{if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/'};if(method==='listFiles')return [];throw Error('Unexpected native call '+method);};
test('disabled PHP intelligence returns an empty result without starting a language process',async()=>{const language=new NativeLanguage(transport);assert.deepEqual(await language.request(input),{isIncomplete:false,items:[]});assert.equal(await language.methodFamily(input),null);});
test('PHP contribution creates its engine from the shared host and stops being used on removal',async()=>{
 Object.assign(globalThis,{window:new EventTarget()});let creates=0,resets=0;let sharedHost:any;
 const remove=providePluginService('test:php','phpIntelligence',{createLanguage:(_call:any,makeHost:any)=>{creates++;sharedHost=makeHost({});return {reset(){resets++;},changed(){},request:async()=>({items:[{label:'PluginClass'}]}),methodFamily:async()=>({name:'foo'}),methodUsages:async()=>[],methodRename:async()=>null};}});
 const language=new NativeLanguage(transport);try{assert.equal((await language.request(input)).items[0].label,'PluginClass');assert.ok(sharedHost);assert.equal(creates,1);await language.request(input);assert.equal(creates,1);remove();assert.deepEqual(await language.request(input),{isIncomplete:false,items:[]});assert.equal(resets,1);}finally{remove();language.reset();}
});

test('independent PHP language plugins continue working without PHP intelligence',async()=>{setExternalPlugins(()=>[{id:'example.independent',name:'Independent',detect:async()=>({}),completeCode:async()=>({from:10,items:[{label:'IndependentCompletion',kind:1}]})}]);try{const language=new NativeLanguage(transport);const result=await language.request(input);assert.equal(result.items[0].label,'IndependentCompletion');}finally{setExternalPlugins(null);}});
