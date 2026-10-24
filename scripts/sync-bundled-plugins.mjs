import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const lock = JSON.parse(await readFile(new URL('../bundled-plugins/lock.json', import.meta.url), 'utf8'));
for (const p of lock) {
 if (!['laravel','dotenv','docker','bash'].includes(p.name) || p.repository !== `https://github.com/phpforge-dev/plugin-${p.name}` || !/^[a-f0-9]{40}$/.test(p.revision) || !/^[a-f0-9]{64}$/.test(p.sha256)) throw Error('Invalid bundled plugin lock');
 const temp = await mkdtemp(join(tmpdir(), 'phpforge-plugin-'));
 const git = args => execFileSync('git', ['-c','core.hooksPath='+join(temp,'no-hooks'),...args], {cwd:temp,stdio:'pipe',timeout:60000});
 try {
  git(['clone','--no-checkout','--depth=1','--',p.repository,'repo']);
  git(['-C','repo','fetch','--depth=1','origin',p.revision]);
  git(['-C','repo','checkout','--detach','FETCH_HEAD']);
  const source = join(temp,'repo');
  const bytes = await readFile(join(source,'main.js'));
  if(createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw Error('Package hash mismatch: '+p.name);
  const manifest=JSON.parse(await readFile(join(source,'plugin.json'),'utf8'));
  if(manifest.id!==`phpforge.${p.name}`)throw Error('Package ID mismatch');
  const dest=new URL(`../bundled-plugins/${p.name}/`,import.meta.url);
  await rm(new URL('src/',dest),{recursive:true,force:true});
  for(const file of ['src','main.js','plugin.json','LICENSE',...(p.name==='docker'?['YAML-LICENSE']:[])])await cp(join(source,file),new URL(file,dest),{recursive:true});
  console.log(p.name+' synced at '+p.revision);
 } finally { await rm(temp,{recursive:true,force:true}); }
}
