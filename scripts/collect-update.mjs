// Release tooling only. Never creates signatures: Tauri must have signed the artifact.
import {readdir,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function collectUpdate({platform,bundle,out,tag,version}) {
 if(!['darwin-aarch64','darwin-x86_64','linux-x86_64','windows-x86_64'].includes(platform)||tag!==`v${version}`||!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid updater release target or version');
 const files=[];
 async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory()&&!item.name.endsWith('.app'))await walk(path);else if(item.isFile()&&(/\.app\.tar\.gz$/.test(item.name)||/\.AppImage$/.test(item.name)||/-setup\.exe$/.test(item.name)))files.push(path);}}
 await walk(bundle);
 const candidates=files.filter(path=>platform.startsWith('darwin')?path.endsWith('.app.tar.gz'):platform.startsWith('linux')?path.endsWith('.AppImage'):path.endsWith('-setup.exe'));
 if(candidates.length!==1)throw Error('Expected exactly one signed updater artifact for '+platform);
 const artifact=candidates[0];const signature=(await readFile(artifact+'.sig','utf8')).trim();
 if(!signature||signature.length>16000)throw Error('Missing or invalid Tauri updater signature');
 const name=basename(artifact).replaceAll(' ','.');await mkdir(out,{recursive:true});await copyFile(artifact,join(out,name));await writeFile(join(out,name+'.sig'),signature+'\n');
 const fragment={version,platform,url:`https://github.com/phpforge-dev/php-ide/releases/download/${tag}/${encodeURIComponent(name)}`,signature};
 await writeFile(join(out,platform+'.json'),JSON.stringify(fragment,null,2)+'\n');return fragment;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const [platform,bundle,out,tag]=process.argv.slice(2);const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 await collectUpdate({platform,bundle,out,tag,version});
}
