import { spawn } from 'node:child_process';

/** Shared CLI lifecycle; use argv arrays and never a shell for project tools. */
export function runCommand(file, args, options = {}) {
  const child = spawn(file, args, { stdio: 'inherit', ...options });
  child.once('error', error => {
    console.error(`Não foi possível executar ${file}: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', code => { process.exitCode = code ?? 1; });
  return child;
}
