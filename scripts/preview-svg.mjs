// Visual fixture only. Real IPC/WebKit behavior is exercised by --svg-only.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const source=`<svg xmlns="http://www.w3.org/2000/svg"
     width="360" height="240" viewBox="0 0 360 240">
  <rect x="40" y="30" width="280" height="180"
        rx="28" fill="#3871e1" />
  <circle cx="180" cy="120" r="64"
          fill="white" fill-opacity="0.18" />
  <path d="M128 120l32 32 72-72" fill="none"
        stroke="white" stroke-width="14"
        stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1423','--strictPort'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1423'))resolve();});server.once('exit',reject);});
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:940}});await page.emulateMedia({colorScheme:process.argv.includes('--light')?'light':'dark'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 const source=${JSON.stringify(source)};
 window.ide=new Proxy({}, {get:(_,method)=>{if(String(method).startsWith('on'))return ()=>()=>{};return async(...args)=>{
  if(method==='workspace')return{root:'/fixture',rootUri:'file:///fixture/',name:'svg-preview'};
  if(method==='tree')return[{name:'preview.svg',path:'preview.svg',directory:false}];
  if(method==='read')return{path:'preview.svg',uri:'file:///fixture/preview.svg',text:source,etag:'fixture'};
  if(method==='gitStatus')return{branch:'main',changes:[],indexToken:'fixture'};
  if(method==='gitEditorBase')return{text:source,label:'HEAD'};
  if(method==='debugStatus')return{listening:null,sessions:[]};
  if(method==='pluginList')return{plugins:[],directories:[]};
  return [];
 }} });await(await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();` }));
 await page.goto('http://127.0.0.1:1423');await page.locator('#tree button[aria-label="preview.svg"]').click();await page.locator('#svg-toolbar [data-mode=split]').click();await page.waitForFunction(()=>document.getElementById('svg-preview')?.dataset.state==='ready');
 const validations=await page.evaluate(async()=>{const {svgImageSource}=await import('/src/svg-preview.ts');for(const source of ['<html/>','<svg><broken></svg>','<!DOCTYPE svg [<!ENTITY x "test">]><svg/>','<svg xmlns="urn:wrong"/>']){let rejected=false;try{svgImageSource(source);}catch{rejected=true;}if(!rejected)return false;}return svgImageSource('<svg width="10" height="10"/>').startsWith('data:image/svg+xml');});if(!validations)throw Error('SVG XML validation failed');
 await page.locator('#svg-preview img').evaluate(img=>img.decode());
 const pixel=await page.locator('#svg-preview img').evaluate(img=>{const c=document.createElement('canvas');c.width=360;c.height=240;const x=c.getContext('2d');x.drawImage(img,0,0);return [...x.getImageData(50,50,1,1).data];});if(pixel.slice(0,3).join(',')!=='56,113,225')throw Error('SVG image pixels missing');

 await page.waitForTimeout(150);
 const suffix=process.argv.includes('--light')?'-light':'';
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/svg-split-preview'+suffix+'.png'});
 await page.locator('#svg-toolbar [data-mode=preview]').click();await page.screenshot({path:'.artifacts/svg-image-preview'+suffix+'.png'});
 if(errors.length)throw Error(errors.join('\n'));console.log('SVG visual fixtures passed.');
}finally{await browser?.close();server.kill();}
