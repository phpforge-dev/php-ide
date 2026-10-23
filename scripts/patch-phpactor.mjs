import {spawnSync} from 'node:child_process';
import {resolve,dirname,basename} from 'node:path';
const target=resolve(process.argv[2]??'.tools/phpactor.phar');
let php;
for(const candidate of [process.env.PHP_IDE_PHP_BIN,'php','/opt/homebrew/opt/php@8.3/bin/php','/usr/local/opt/php@8.3/bin/php'].filter(Boolean)){
 const result=spawnSync(candidate,['-r','exit(PHP_VERSION_ID >= 80200 ? 0 : 1);'],{stdio:'ignore',timeout:3000});if(result.status===0){php=candidate;break;}
}
const args=php?['-d','phar.readonly=0',resolve('scripts/patch-phpactor.php'),target]:['run','--rm','--network','none','-v',`${dirname(target)}:/tools`,'-v',`${resolve('scripts/patch-phpactor.php')}:/patch.php:ro`,'php:8.3-cli','php','-d','phar.readonly=0','/patch.php','/tools/'+basename(target)];
const result=spawnSync(php??'docker',args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
