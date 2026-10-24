// Build/test tooling only. Runtime semantics and workers come from the pinned plugin package.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const packageRoot=fileURLToPath(new URL('../.tools/plugin-packages/web-languages/',import.meta.url));
function run(command,args,cwd){
 const result=spawnSync(command,args,{cwd,stdio:'inherit',shell:process.platform==='win32'&&command.endsWith('.cmd')});
 if(result.error){console.error(result.error.message);process.exit(1);}
 if(result.status!==0)process.exit(result.status??1);
}
run(process.execPath,['scripts/prepare-plugin-tests.mjs'],root);
const npm=process.platform==='win32'?'npm.cmd':'npm';
run(npm,['ci','--ignore-scripts','--no-audit','--no-fund'],packageRoot);
if(process.argv.includes('--bundled-workers'))console.log('Web language verification always uses the pinned plugin production bundle and its self-contained workers.');
run(npm,['run','test:browser'],packageRoot);
