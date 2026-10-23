import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
const child=spawn(process.execPath,['node_modules/@tauri-apps/cli/tauri.js',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,PATH:join(homedir(),'.cargo','bin')+delimiter+process.env.PATH}});
child.on('exit',code=>process.exit(code??1));
