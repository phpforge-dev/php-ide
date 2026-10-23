import { chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
// The node-pty 1.1.0 tarball can lack the executable bit on its macOS spawn helper.
if(process.platform==='darwin') {
 const path=join('node_modules','node-pty','prebuilds',`darwin-${process.arch}`,'spawn-helper');
 try { const file=await stat(path); await chmod(path,file.mode|0o111); }
 catch(error){if(error.code!=='ENOENT')throw error;}
}
