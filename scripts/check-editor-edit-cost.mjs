import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import ts from 'typescript';
import {createServer} from 'vite';
import {webkit} from '@playwright/test';

const source=await readFile('src/main.ts','utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const functions=ts.transpileModule(extract('function bufferChanged(',"window.addEventListener('ide-autosave")+extract('function tabs()','function closeFile('),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const server=await createServer({server:{host:'127.0.0.1',port:1442,strictPort:true}});let browser;
try{
 await server.listen();browser=await webkit.launch({headless:true});const page=await browser.newPage();
 page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
  import {fileIcon} from '/src/file-icons.ts';
  document.body.innerHTML='<section class="code"><div id="tabs"></div></section><div id="tree"></div><button id="definition"></button><button id="references"></button><button id="implementations"></button><div id="breadcrumbs"></div>';
  const $=id=>document.getElementById(id),tr=s=>s;
  const buffers=new Map(),opened=new Set(),navigable=['php'],phpLike=['php','blade'];
  const editor={getModel:()=>({getLanguageId:()=> 'php'})};
  const webLanguage=()=>false,activate=()=>{},closeFile=()=>{},showTabMenu=()=>{};
  let active='File0.php',reads=0,scheduled=0;
  const dirty=b=>!b.virtual&&b.model.getValue()!==b.saved;
  const scheduleAutosave=()=>scheduled++;
  for(let i=0;i<30;i++){
   const path='File'+i+'.php',saved='<?php class File'+i+' {\\n'+'public function run() {}\\n'.repeat(100)+'}';
   const b={saved,text:saved};b.model={getValue:()=>{reads++;return b.text}};buffers.set(path,b);opened.add(path);
  }
  for(let i=0;i<2000;i++){const b=document.createElement('button');b.dataset.path='File'+i+'.php';b.append(document.createElement('span'));$('tree').append(b);}
  ${functions}
  tabs();
  window.run=()=>{
   const b=buffers.get(active),button=$('tabs').firstElementChild.firstElementChild;
   button.focus();reads=0;scheduled=0;
   const begin=performance.now();
   for(let i=0;i<100;i++){b.text=b.saved+' '.repeat(i+1);bufferChanged(b.model);}
   const elapsed=performance.now()-begin;
   const result={elapsedMs:elapsed,reads,scheduled,sameTab:$('tabs').firstElementChild.firstElementChild===button,focus:document.activeElement===button,dirty:button.textContent.endsWith(' •')};
   b.text=b.saved;bufferChanged(b.model);result.undoClean=!button.textContent.endsWith(' •');
   const baseline=performance.now();reads=0;
   for(let i=0;i<100;i++)tabs();
   result.fullRefreshMs=performance.now()-baseline;result.fullRefreshReads=reads;
   return result;
  };
  window.ready=true;
 `}));
 await page.goto('http://127.0.0.1:1442');await page.waitForFunction(()=>window.ready);
 const result=await page.evaluate(()=>window.run());
 assert.equal(result.reads,100);assert.equal(result.scheduled,100);
 for(const key of ['sameTab','focus','dirty','undoClean'])assert.equal(result[key],true,key);
 assert.deepEqual(errors,[]);
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/editor-edit-cost.json',JSON.stringify(result,null,2));
 console.log(result);
}finally{await browser?.close();await server.close();}
