import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { runCommand } from './run-command.mjs';

runCommand(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', ...process.argv.slice(2)], {
  env: { ...process.env, PATH: join(homedir(), '.cargo', 'bin') + delimiter + (process.env.PATH ?? '') },
});
