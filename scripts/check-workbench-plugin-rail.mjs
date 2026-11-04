import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {webkit} from '@playwright/test';

const source=await readFile('src/main.ts','utf8');
const shell=source.match(/innerHTML = html`([^`]+)`/)[1];
const server=await createServer({server:{host:'127.0.0.1',port:1441,strictPort:true}});
let browser;
try{
 await server.listen();
 browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:720}});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
  import {mountWorkbench} from '/src/workbench.ts';
  import '/src/style.css';import '/src/workbench.css';
  import '/.tools/plugin-packages/git/workbench.css';
  document.documentElement.dataset.theme='dark';
  document.body.innerHTML='<div id="app"></div>';
  document.getElementById('app').innerHTML=${JSON.stringify(shell)};
  mountWorkbench({gitStatus:async()=>({branch:'main'})});
  window.installGit=()=>{
   const tools=document.createElement('div');tools.className='switch';
   tools.innerHTML='<button id="show-project">Project</button><button id="show-commit">Commit</button><button id="show-git">Git</button>';
   document.querySelector('main > aside').prepend(tools);
   window.calls=0;
   for(const id of ['show-project','show-commit','show-git'])document.getElementById(id).onclick=()=>window.calls++;
  };
  window.ready=true;
 `}));
 await page.goto('http://127.0.0.1:1441');await page.waitForFunction(()=>window.ready);
 for(let cycle=0;cycle<2;cycle++){
  await page.evaluate(()=>window.installGit());
  await page.waitForFunction(()=>document.querySelectorAll('.left-rail > #show-project, .left-rail > #show-commit, .left-rail > #show-git').length===3);
  assert.equal(await page.locator('main > aside > .switch').count(),0);
  assert.equal(await page.locator('.left-rail #show-commit svg').count(),1);
  await page.locator('#show-commit').click();
  assert.equal(await page.locator('#show-commit').getAttribute('aria-pressed'),'true');
  await page.locator('#show-commit').click();
  assert.equal(await page.locator('main').evaluate(el=>el.classList.contains('left-hidden')),true);
  await page.locator('#show-project').click();
  assert.equal(await page.locator('main').evaluate(el=>el.classList.contains('left-hidden')),false);
  await page.locator('#show-git').click();
  assert.equal(await page.evaluate(()=>window.calls),4);
  await mkdir('.artifacts',{recursive:true});
  await page.screenshot({path:'.artifacts/workbench-plugin-rail.png'});
  await page.evaluate(()=>{for(const id of ['show-project','show-commit','show-git'])document.getElementById(id).remove();});
 }
 assert.deepEqual(errors,[]);
 console.log('WebKit: late plugin controls, icons, collapse/reopen, callbacks and reinstall passed.');
}finally{await browser?.close();await server.close();}
