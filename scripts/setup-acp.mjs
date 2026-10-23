import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
// Adaptador ACP do Claude Code (Apache-2.0), isolado em .tools/acp com versão fixa e sem scripts de instalação.
const version = '0.16.2';
mkdirSync('.tools/acp', { recursive: true });
execFileSync('npm', ['install', '--prefix', '.tools/acp', '--no-audit', '--no-fund', '--ignore-scripts', '--save-exact', `@zed-industries/claude-code-acp@${version}`], { stdio: 'inherit' });
const bin = '.tools/acp/node_modules/@zed-industries/claude-code-acp/dist/index.js';
if (!existsSync(bin)) throw new Error('Adaptador não encontrado após a instalação');
console.log(`claude-code-acp ${version} instalado em .tools/acp`);
