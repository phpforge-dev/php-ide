// macOS: real AppKit window before any frontend JavaScript, then real Welcome flow.
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
if(process.platform!=='darwin')throw Error('This test requires macOS AppKit');
const temp=await mkdtemp(join(tmpdir(),'php-ide-splash-'));
const report=resolve('.artifacts/splash-startup.json'),log=report.replace('.json','.splash.log');
let release;const frontendGate=new Promise(r=>release=r);let app;
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve('dist','.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(resolve('dist')+'/')){res.writeHead(403).end();return;}
  if(file.endsWith('.js'))await frontendGate;
  const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'})[extname(file)]??'application/octet-stream');res.end(data);
 }catch{res.writeHead(404).end();}
});
try{
 await mkdir('.artifacts',{recursive:true});await rm(log,{force:true});await rm(report,{force:true});
 const source=join(temp,'source');await mkdir(source);await writeFile(join(source,'hello.php'),'<?php // fixture\n');
 for(const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','initial']])execFileSync('git',['-C',source,...args]);
 await new Promise((r,j)=>{server.once('error',j);server.listen(1420,'127.0.0.1',r);});
 const env={...process.env,PHP_IDE_STATE_DIR:join(temp,'profile'),PHP_IDE_NATIVE_SMOKE:report,PHP_IDE_STARTUP_SMOKE:temp};delete env.PHP_IDE_PROJECT;
 app=spawn(resolve('src-tauri/target/debug/php-ide'),[],{env,stdio:['ignore','ignore','pipe']});let errors='';app.stderr.on('data',d=>errors+=d);
 const exited=new Promise(r=>app.once('exit',r));
 let events='';for(let i=0;i<100;i++){try{events=await readFile(log,'utf8');}catch{}if(events.includes('creating-webview'))break;await new Promise(r=>setTimeout(r,100));}
 assert(events.includes('native-image-visible-before-webview'),errors||'Native splash never appeared');
 assert(!events.includes('main-visible'),'Main window appeared before frontend readiness');
 let windows=[];
 for(let i=0;i<30;i++){
  windows=JSON.parse(execFileSync('osascript',['-l','JavaScript','-e',`ObjC.import('CoreGraphics');JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly,0))).filter(w=>w.kCGWindowOwnerPID===${app.pid}&&w.kCGWindowLayer===0))`],{encoding:'utf8'}));
  if(windows.length)break;await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(windows.length,1,'Expected only the AppKit splash to be visible');
 assert.equal(windows[0].kCGWindowBounds.Width,460);
 if(process.argv.includes('--screenshot'))execFileSync('screencapture',['-x','-o','-l',String(windows[0].kCGWindowNumber),resolve('.artifacts/native-splash.png')]);
 if(process.argv.includes('--watchdog')){
  for(let i=0;i<350;i++){
   events=await readFile(log,'utf8');
   if(events.includes('native-splash-closed'))break;
   await new Promise(r=>setTimeout(r,100));
  }
  assert(events.includes('native-watchdog-recovery'),'Watchdog did not reveal recovery');
  assert(events.includes('main-visible')&&events.includes('native-splash-closed'),'Watchdog left the native splash open');
 }
 release();
 const code=await Promise.race([exited,new Promise((_,j)=>setTimeout(()=>j(Error('Startup smoke timeout: '+errors)),60000).unref())]);
 const result=JSON.parse(await readFile(report,'utf8'));assert.equal(code,0,errors);assert(result.ok,JSON.stringify(result));
 assert.deepEqual((await readFile(log,'utf8')).trim().split('\n').slice(0,5),['native-image-visible-before-webview','creating-webview',process.argv.includes('--watchdog')?'native-watchdog-recovery':'frontend-ready-or-recovery','main-visible','native-splash-closed']);
 console.log(JSON.stringify({nativeSplash:'AppKit image visible with frontend blocked; handoff passed',...result},null,2));
}finally{release();app?.kill();server.closeAllConnections();server.close();await rm(temp,{recursive:true,force:true});}
