import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function mergeUpdateManifest(directory,version){
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid release version');
 const platforms={};
 for(const file of await readdir(directory)){if(!/^(darwin|linux|windows)-.*\.json$/.test(file))continue;
  const item=JSON.parse(await readFile(join(directory,file),'utf8'));
  if(item.version!==version||!item.signature||!item.url?.startsWith(`https://github.com/phpforge-dev/php-ide/releases/download/v${version}/`)||platforms[item.platform])throw Error('Inconsistent updater fragment');
  platforms[item.platform]={url:item.url,signature:item.signature};
 }
 for(const target of ['darwin-aarch64','linux-x86_64','windows-x86_64'])if(!platforms[target])throw Error('Missing updater platform: '+target);
 const manifest={version,notes:`PHP IDE ${version}`,pub_date:new Date().toISOString(),platforms};
 await writeFile(join(directory,'latest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await mergeUpdateManifest(process.argv[2],process.argv[3]);
