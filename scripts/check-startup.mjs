import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const temp=await mkdtemp(join(tmpdir(),'php-ide-startup-'));let app;const report=resolve('.artifacts/startup-native.json');
try{
 await mkdir('.artifacts',{recursive:true});await rm(report,{force:true});const source=join(temp,'source');await mkdir(source);await writeFile(join(source,'hello.php'),'<?php // fixture\n');
 for(const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','initial']])execFileSync('git',['-C',source,...args]);
 const env={...process.env,PHP_IDE_STATE_DIR:join(temp,'profile'),PHP_IDE_NATIVE_SMOKE:report,PHP_IDE_STARTUP_SMOKE:temp};delete env.PHP_IDE_PROJECT;
 app=spawn(resolve('src-tauri/target/release/bundle/macos/PHP IDE.app/Contents/MacOS/php-ide'),[],{env,stdio:['ignore','pipe','pipe']});let logs='';app.stderr.on('data',data=>logs+=data);
 const code=await Promise.race([new Promise(r=>app.once('exit',r)),new Promise((_,reject)=>setTimeout(()=>reject(Error('Timeout: '+logs)),60000).unref())]);
 const result=JSON.parse(await readFile(report,'utf8'));console.log(JSON.stringify(result,null,2));if(code!==0||!result.ok)process.exitCode=1;
} catch(error){console.error(error);process.exitCode=1;} finally{app?.kill();await rm(temp,{recursive:true,force:true});}
