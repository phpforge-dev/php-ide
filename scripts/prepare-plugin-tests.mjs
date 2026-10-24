// Test dependencies only: download pinned packages; never execute repository scripts.
import {readFile, writeFile, mkdir, mkdtemp, rm, rename} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const packages=(await Promise.all(['default-plugins.json','test-plugins.json'].map(async name=>JSON.parse(await readFile(new URL('../'+name,import.meta.url),'utf8'))))).flat();
const cache=resolve('.tools/plugin-packages');await mkdir(cache,{recursive:true});
for(const {plugin:p,sha256} of packages){
 const name=p.repository.split('/plugin-')[1]??'';
 if(!/^[a-z-]+$/.test(name)||p.repository!==`https://github.com/phpforge-dev/plugin-${name}`||!/^[a-f0-9]{40}$/.test(p.revision))throw Error('Invalid default plugin');
 const dest=join(cache,name);const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 try{if((await readFile(join(dest,'.revision'),'utf8'))===p.revision&&digest(await readFile(join(dest,'main.js')))===sha256)continue;}catch{}
 const temp=await mkdtemp(join(cache,'.download-'));
 const git=args=>execFileSync('git',['-c','core.hooksPath='+join(temp,'no-hooks'),'-c','credential.helper=',...args],{cwd:temp,stdio:'pipe',timeout:60000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_LFS_SKIP_SMUDGE:'1'}});
 try{
  git(['clone','--no-checkout','--depth=1','--',p.repository,'repo']);
  git(['-C','repo','fetch','--depth=1','origin',p.revision]);
  git(['-C','repo','checkout','--detach','FETCH_HEAD']);
  const source=join(temp,'repo');const manifest=JSON.parse(await readFile(join(source,'plugin.json'),'utf8'));
  if(manifest.id!==p.id||manifest.version!==p.version||digest(await readFile(join(source,manifest.main)))!==sha256)throw Error('Package integrity mismatch: '+name);
  await rm(join(source,'.git'),{recursive:true});await writeFile(join(source,'.revision'),p.revision);
  await rm(dest,{recursive:true,force:true});await rename(source,dest);
  console.log(name+' test dependency ready at '+p.revision.slice(0,12));
 }finally{await rm(temp,{recursive:true,force:true});}
}
