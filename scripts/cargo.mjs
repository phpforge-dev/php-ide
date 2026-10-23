import { homedir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './run-command.mjs';

const [command = 'check', ...args] = process.argv.slice(2);
const cargo = join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
// Cargo's manifest option belongs before `--` (test/compiler arguments).
runCommand(cargo, [command, '--manifest-path', 'src-tauri/Cargo.toml', ...args]);
