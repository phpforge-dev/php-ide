// Local acceptance of the signed IDE update flow on macOS. Everything is disposable:
// - a throwaway Tauri updater key pair generated in a temp folder (never a release key);
// - two release builds with a separate bundle identifier, so the developer's profile and installed
//   IDE are untouched: the "installed" app (current version) and a newer signed build;
// - a loopback HTTP endpoint compiled in through PHP_IDE_UPDATER_TEST_ENDPOINT, accepted only
//   together with dangerousInsecureTransportProtocol in the test overlay.
// Scenario: the installed app checks on launch with "Download IDE updates automatically" on,
// downloads the package and applies it when its window closes normally. A tampered signature must
// be rejected without touching the app; a valid one must replace it with the newer version.
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';

if(process.platform!=='darwin')throw Error('The local updater acceptance currently drives macOS only');
const identifier='dev.php-ide.updater-test';
const current=JSON.parse(await readFile('package.json','utf8')).version;
const next='0.2.99';
const port=18000+Math.floor(Math.random()*1000);
const endpoint=`http://127.0.0.1:${port}/latest.json`;
// The real path: launched through the /var -> /private/var symlink the app fails to resolve its paths.
const temp=await mkdtemp(join(await realpath(tmpdir()),'php-ide-updater-'));
const profile=join(homedir(),'Library','Application Support',identifier);
const report={date:new Date().toISOString(),current,next,endpoint,steps:[]};
const step=(name,detail={})=>{report.steps.push({name,...detail});console.log('•',name,JSON.stringify(detail));};
const run=(file,args,opts={})=>(execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','inherit'],...opts})??'').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const plistVersion=app=>run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',join(app,'Contents','Info.plist')]);
const tauri=(args,env)=>run(process.execPath,['scripts/tauri.mjs',...args],{env:{...process.env,...env},stdio:['ignore','inherit','inherit'],maxBuffer:1<<30});
if(existsSync(profile))throw Error(`Refusing to reuse an existing test profile: ${profile}`);

try{
 // 1. Throwaway key pair (empty password), kept only in the temp folder.
 const key=join(temp,'updater-test.key');
 tauri(['signer','generate','--ci','-p','','-w',key],{});
 const publicKey=(await readFile(key+'.pub','utf8')).trim();
 const privateKey=(await readFile(key,'utf8')).trim();
 step('generated a throwaway updater key',{publicKeyChars:publicKey.length});

 const overlay=async(name,extra)=>{const file=join(temp,name);await writeFile(file,JSON.stringify({identifier,...extra,plugins:{updater:{pubkey:publicKey,requireSignedVersion:true,dangerousInsecureTransportProtocol:true}}}));return file;};
 const env={PHP_IDE_UPDATER_PUBLIC_KEY:publicKey,PHP_IDE_UPDATER_TEST_ENDPOINT:endpoint,NO_STRIP:'true'};
 const bundle=resolve('src-tauri/target/release/bundle/macos');

 // 2. The installed app at the current version.
 await rm(bundle,{recursive:true,force:true});
 tauri(['build','--bundles','app','--config',await overlay('installed.json',{})],env);
 const installed=join(temp,'Applications','PHP IDE.app');
 await mkdir(join(temp,'Applications'));await cp(join(bundle,'PHP IDE.app'),installed,{recursive:true,verbatimSymlinks:true});
 step('built the installed app',{version:plistVersion(installed)});

 // 3. The newer release, signed by the Tauri CLI with the throwaway key.
 await rm(bundle,{recursive:true,force:true});
 tauri(['build','--bundles','app','--config',await overlay('release.json',{version:next,bundle:{createUpdaterArtifacts:true}})],{...env,TAURI_SIGNING_PRIVATE_KEY:privateKey,TAURI_SIGNING_PRIVATE_KEY_PASSWORD:''});
 const archive=join(bundle,'PHP IDE.app.tar.gz');
 const signature=(await readFile(archive+'.sig','utf8')).trim();
 const payload=await readFile(archive);
 // A valid signature of other content: correct key, wrong file.
 const decoy=join(temp,'decoy.bin');await writeFile(decoy,'not the release');
 tauri(['signer','sign','-k',privateKey,'-p','','--app-version',next,decoy],{});
 const wrongSignature=(await readFile(decoy+'.sig','utf8')).trim();
 step('built and signed the newer release',{bytes:payload.length});

 let manifestSignature=wrongSignature;const requests=[];let served=0;
 const server=createServer((req,res)=>{
  requests.push(req.url);
  if(req.url==='/latest.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify({version:next,notes:'Local updater acceptance',pub_date:new Date().toISOString(),platforms:{'darwin-aarch64':{url:`http://127.0.0.1:${port}/PHP.IDE.app.tar.gz`,signature:manifestSignature}}}));}
  else if(req.url==='/PHP.IDE.app.tar.gz'){res.setHeader('content-length',payload.length);res.on('finish',()=>served++);res.end(payload);}
  else{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(port,'127.0.0.1',r));

 await mkdir(profile,{recursive:true});
 await writeFile(join(profile,'app-preferences.json'),JSON.stringify({preferences:{setupComplete:true,autoUpdatePlugins:false,autoUpdateIde:true,checkUpdates:true},jobs:[]}));

 async function session(label){
  requests.length=0;const before=served;
  const child=spawn(join(installed,'Contents','MacOS','php-ide'),[],{stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const exited=new Promise(r=>child.on('exit',code=>r(code)));
  const started=Date.now();
  // Wait until the whole package was sent, so a rejection cannot be a download still in flight.
  while(served===before&&Date.now()-started<300000)await sleep(500);
  if(served===before){try{run('screencapture',['-x','.artifacts/updater-local-timeout.png']);}catch{}child.kill();throw Error(`${label}: the app never downloaded the update (requests: ${requests.join(', ')})\n${log.slice(-4000)}`);}
  await sleep(5000);
  // Close the window normally (same path as the red button), which applies a ready update.
  run('osascript',['-e',`tell application "System Events" to tell (first process whose unix id is ${child.pid}) to click (first button of window 1 whose subrole is "AXCloseButton")`]);
  const code=await Promise.race([exited,sleep(120000).then(()=>'timeout')]);
  if(code==='timeout'){child.kill();throw Error(`${label}: the app did not exit after closing its window`);}
  return {exitCode:code,requests:[...requests],log:log.split('\n').filter(line=>/updat|signature|minisign/i.test(line)).slice(-10)};
 }

 // 4. Tampered signature: downloaded, rejected, the installed app stays at the current version.
 const rejected=await session('tampered');
 const afterRejected=plistVersion(installed);
 if(afterRejected!==current)throw Error('A wrongly signed package replaced the app');
 step('tampered signature was rejected',{...rejected,installedVersion:afterRejected});

 // 5. Valid signature: downloaded, verified and installed on normal close.
 manifestSignature=signature;
 const accepted=await session('valid');
 const afterAccepted=plistVersion(installed);
 if(afterAccepted!==next)throw Error(`The signed update was not installed (version ${afterAccepted})`);
 run('codesign',['--verify','--deep','--strict',installed]);
 step('valid signed update was installed on close',{...accepted,installedVersion:afterAccepted});
 server.close();
 report.result='passed';
}catch(error){report.result='failed';report.error=String(error?.stack??error);throw error;}
finally{
 const keep=process.env.PHP_IDE_UPDATER_KEEP==='1';
 if(keep)console.log('kept for inspection:',temp,profile);
 await mkdir('.artifacts',{recursive:true});
 await writeFile('.artifacts/updater-local.json',JSON.stringify(report,null,2)+'\n');
 if(!keep)await rm(temp,{recursive:true,force:true});
 if(!keep)for(const dir of [profile,join(homedir(),'Library','Caches',identifier),join(homedir(),'Library','WebKit',identifier)])await rm(dir,{recursive:true,force:true});
 if(!keep)await rm(resolve('src-tauri/target/release/bundle/macos'),{recursive:true,force:true});
 if(report.error)console.error(report.error);console.log('report: .artifacts/updater-local.json',report.result);
 process.exit(report.result==='passed'?0:1);
}
