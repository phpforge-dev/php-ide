// Integração real do depurador (.tools/plugin-packages/php-debugger/native/src/debug.rs) com Xdebug 3 num container descartável.
// Constrói uma imagem local mínima (php:8.3-cli + pecl xdebug), roda os testes ignorados de
// debug::integration e não deixa containers para trás (`docker run --rm`).
// Uso: node scripts/check-xdebug.mjs [--remove-image]
import {spawnSync} from 'node:child_process';import {homedir} from 'node:os';import {join} from 'node:path';
const image=process.env.PHP_IDE_XDEBUG_IMAGE??'php-ide-xdebug-test:8.3';
const dockerfile='FROM php:8.3-cli\nRUN pecl install xdebug-3.4.5 && docker-php-ext-enable xdebug\n';
const run=(cmd,args,opts={})=>{const r=spawnSync(cmd,args,{stdio:'inherit',...opts});if(r.status!==0)throw Error(`${cmd} ${args.join(' ')} falhou (${r.status})`);};
if(spawnSync('docker',['info'],{stdio:'ignore'}).status!==0){console.error('Docker indisponível: inicie o Docker para rodar a integração Xdebug.');process.exit(1);}
if(spawnSync('docker',['image','inspect',image],{stdio:'ignore'}).status!==0)run('docker',['build','-t',image,'-'],{input:dockerfile,stdio:['pipe','inherit','inherit']});
try{run(join(homedir(),'.cargo','bin','cargo'),['test','--manifest-path','.tools/plugin-packages/php-debugger/native/Cargo.toml','--bin','phpforge-php-debugger','debug::integration','--','--ignored','--test-threads=1','--nocapture'],{env:{...process.env,PHP_IDE_XDEBUG_IMAGE:image}});console.log('Integração Xdebug: OK');}
finally{if(process.argv.includes('--remove-image'))spawnSync('docker',['image','rm',image],{stdio:'inherit'});}
