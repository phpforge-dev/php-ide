import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,cp,writeFile,readFile,rm,mkdir,realpath} from 'node:fs/promises';import {tmpdir,homedir} from 'node:os';import {join,resolve,delimiter} from 'node:path';
const temp=await mkdtemp(join(tmpdir(),'php-ide-native-'));const root=join(temp,'project');const packaged=process.argv.includes('--packaged');const compareP0=process.argv.includes('--compare-p0');const report=resolve(compareP0?'.artifacts/compare-p0.json':packaged?'.artifacts/native-packaged.json':process.argv.includes('--no-db')?'.artifacts/native-smoke-core.json':'.artifacts/native-smoke.json');await mkdir('.artifacts',{recursive:true});await rm(report,{force:true});const owned=[];let app;let vite;let shooter;let composeCleanup;
const allFeatures = !process.argv.some(arg => arg.endsWith('-only'));
const run=(file,args,opts={})=>execFileSync(file,args,{encoding:'utf8',...opts}).trim();
try{
 await cp(resolve('fixtures/php-intelligence'),root,{recursive:true});
 if(process.argv.includes('--web-only'))await cp(resolve('fixtures/web-intelligence'),root,{recursive:true});
 // Runner PHPUnit falso (só no projeto temporário): grava um JUnit com um teste que passa e outro que falha.
 await mkdir(join(root,'vendor','bin'),{recursive:true});await writeFile(join(root,'vendor','bin','phpunit'),'<?php\n$f = getcwd() . "/SmokeTest.php";\n$i = array_search("--log-junit", $argv);\nfile_put_contents($argv[$i + 1], "<testsuites><testsuite><testcase name=\\"testPasses\\" class=\\"SmokeTest\\" file=\\"$f\\" line=\\"4\\" time=\\"0.01\\"/><testcase name=\\"testFails\\" class=\\"SmokeTest\\" file=\\"$f\\" line=\\"5\\" time=\\"0.02\\"><failure type=\\"X\\">SmokeTest::testFails\\nFailed asserting that false is true.\\n\\n$f:5</failure></testcase></testsuite></testsuites>");\necho "fake phpunit " . implode(" ", array_slice($argv, 1, 2)) . "\\n";\nexit(1);\n');
 await writeFile(join(root,'SmokeTest.php'),'<?php\nuse PHPUnit\\Framework\\TestCase;\nfinal class SmokeTest extends TestCase {\n public function testPasses(): void { $this->assertTrue(true); }\n public function testFails(): void { $this->assertTrue(false); }\n}\n');await writeFile(join(root,'scratch.txt'),'initial\n');
 await writeFile(join(root,'notes.md'),'# Notas\n\nVeja o [guia](md-guide.md#seção) e <script>alert(1)</script>.\n\n![logo](md-logo.svg)\n');await writeFile(join(root,'md-guide.md'),'# Guia\n\n## Seção\n\nTexto.\n');await writeFile(join(root,'md-diagram.md'),'# Diagrama\n\n```mermaid\nflowchart LR\n  A[Início] --> B{Ok?}\n  B -- sim --> C[Fim]\n```\n\n```mermaid\nflowchart LR\n  A -->\n```\n\n[quebrado](nao-existe.md)\n');await writeFile(join(root,'md-logo.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>\n');
 if(allFeatures || process.argv.includes('--svg-only')){
  await writeFile(join(root,'preview.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128" viewBox="0 0 256 128"><rect width="256" height="128" fill="#3871e1"/><circle cx="128" cy="64" r="32" fill="white"/></svg>');
  await writeFile(join(root,'active-content.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" onload="parent.__svgExecuted=true"><script>parent.__svgExecuted=true</script><rect width="32" height="32" fill="red"/></svg>');
 }
 if(allFeatures || process.argv.includes('--ignored-tree-only')){
  await writeFile(join(root,'.gitignore'),'ignored-cache/\nnode_modules/\n*.ignored\n');
  await mkdir(join(root,'ignored-cache'));await writeFile(join(root,'ignored-cache','cache.txt'),'fixture');
  await mkdir(join(root,'node_modules'));await writeFile(join(root,'node_modules','fixture.txt'),'fixture');
  await writeFile(join(root,'fixture.ignored'),'fixture');await writeFile(join(root,'visible.txt'),'fixture');
 }
 if(allFeatures || process.argv.includes('--bash-only')){
  await writeFile(join(root,'build.sh'),'#!/bin/bash\nNAME=fixture\ngreet() { printf "%s\\n" "$NAME"; }\ngreet\n');
  await writeFile(join(root,'run-bash'),'#!/usr/bin/env bash\necho hello\n');
  await writeFile(join(root,'.bashrc'),'export FIXTURE=hello\n');
 }
 if(allFeatures || process.argv.includes('--docker-language-only')){
  await writeFile(join(root,'Dockerfile.dev'),'# Synthetic Docker fixture\nFROM php:8.3-cli AS builder\nWORKDIR /app\nCOPY --from=builder /app /app\n');
  await writeFile(join(root,'composer.yml'),'services:\n  app:\n    image: php:8.3-cli\n    depends_on:\n      - db\n  db:\n    image: postgres:16\n');
  await writeFile(join(root,'deployment.yml'),'services:\n  web:\n    image: nginx:alpine\n');
 }
 if(allFeatures || process.argv.includes('--dotenv-only')){
  const composer=JSON.parse(await readFile(join(root,'composer.json'),'utf8'));composer.require['laravel/framework']='^12.0';await writeFile(join(root,'composer.json'),JSON.stringify(composer));
  await writeFile(join(root,'.env'),'# Synthetic Laravel fixture\nAPP_NAME=Laravel\nAPP_DEBUG=true\nDB_PORT=3306\nMAIL_NAME="${APP_NAME}"\n');
  await writeFile(join(root,'.env.testing'),'APP_NAME=Testing\nMAIL_NAME="${APP_NAME}"\n');
 }
 if(allFeatures || process.argv.includes('--database-only')){
  const composer=JSON.parse(await readFile(join(root,'composer.json'),'utf8'));composer.require['laravel/framework']='^12.0';await writeFile(join(root,'composer.json'),JSON.stringify(composer));
  const header=allFeatures?['# Synthetic Laravel fixture','APP_NAME=Laravel','APP_DEBUG=true','DB_PORT=3307','MAIL_NAME="${APP_NAME}"']:[];
  const connection=['DB_CONNECTION=mysql','DB_HOST=127.0.0.1',...(!allFeatures?['DB_PORT=3307']:[]),'DB_DATABASE=laravel_fixture','DB_USERNAME=sail','DB_PASSWORD="fixture-password"'];
  await writeFile(join(root,'.env'),[...header,...connection,''].join('\n'));
 }
 const second=join(temp,'recent-fixture');await mkdir(second);await writeFile(join(second,'index.php'),'<?php echo "Recent project";\n');
 await mkdir(join(temp,'profile'));await writeFile(join(temp,'profile','recent-projects.json'),JSON.stringify([{path:await realpath(second),name:'recent-fixture'},{path:join(temp,'missing-project'),name:'missing-project'}]));
 for(const args of [['init','-q','-b','main'],['config','user.name','Native Fixture'],['config','user.email','native@example.invalid'],['add','.'],['commit','-qm','Initial native fixture']])run('git',['-C',root,...args]);
 const remote=join(temp,'remote.git');run('git',['init','--bare','-q',remote]);run('git',['-C',root,'remote','add','origin',remote]);
 const dockerReal=process.argv.includes('--docker-real');let dockerFixture;
 const dockerState=join(temp,'docker-state.json');
 if(dockerReal){
  const contexts=run('docker',['context','ls','--format','{{json .}}']).split('\n').map(s=>JSON.parse(s));const context=contexts.find(c=>c.Current)?.Name??'default';
  const name='php-ide-docker-test-'+Date.now();const project='phpide-compose-test-'+Date.now();
  const id=run('docker',['--context',context,'create','--name',name,'--network','none','--label','php-ide.test=true','php:8.3-cli','sh','-c','echo DOCKER_FIXTURE_READY; while :; do sleep 1; done'],{timeout:30000});owned.push({name,context});
  dockerFixture={context,id,name,project,real:true};composeCleanup={context,project};
  await writeFile(join(root,'compose.yaml'),`name: ${project}\nservices:\n  app:\n    image: php:8.3-cli\n    network_mode: none\n    command: ["sh", "-c", "echo ComposeFixture; while :; do sleep 1; done"]\n`);
 }else{
  dockerFixture={context:'fixture-local',id:'a'.repeat(64),name:'fixture-php',project:'fixture-compose',real:false};
  await writeFile(dockerState,JSON.stringify({containers:[{ID:dockerFixture.id,Names:dockerFixture.name,Image:'php:8.3-cli',State:'exited',Status:'Exited (0)',Ports:''}],images:[{ID:'sha256:'+'d'.repeat(64),Repository:'php',Tag:'8.3-cli',Size:'120 MB'}]}));
  await writeFile(join(root,'compose.yaml'),'services:\n  app:\n    image: php:8.3-cli\n');
 }
 run('git',['-C',root,'add','.']);run('git',['-C',root,'commit','-qm','Complete synthetic fixtures']);
 dockerFixture.svgOnly=process.argv.includes('--svg-only');
 dockerFixture.ignoredTreeOnly=process.argv.includes('--ignored-tree-only');
 dockerFixture.bashOnly=process.argv.includes('--bash-only');
 dockerFixture.dockerLanguageOnly=process.argv.includes('--docker-language-only');
 dockerFixture.dotenvOnly=process.argv.includes('--dotenv-only');
 dockerFixture.databaseOnly=process.argv.includes('--database-only');
 dockerFixture.webOnly=process.argv.includes('--web-only');dockerFixture.searchOnly=process.argv.includes('--search-only');dockerFixture.editorOnly=process.argv.includes('--editor-only');dockerFixture.referencesOnly=process.argv.includes('--references-only');dockerFixture.insightsOnly=process.argv.includes('--insights-only');dockerFixture.compareP0=compareP0;dockerFixture.compareReps=Number(process.env.PHP_IDE_COMPARE_REPS)||3;
 const inputs=[];
 if(!process.argv.includes('--no-db')&&!compareP0){
  for(const [driver,image,port,env]of [['postgres','postgres:16','5432',['POSTGRES_PASSWORD=fixture','POSTGRES_DB=fixture']],['mysql','mysql:8.4','3306',['MYSQL_ROOT_PASSWORD=fixture','MYSQL_DATABASE=fixture']]]){
   const name='php-ide-native-test-'+driver+'-'+Date.now();run('docker',['run','--rm','-d','--name',name,'-p','127.0.0.1::'+port,...env.flatMap(v=>['-e',v]),image]);owned.push(name);const assigned=Number(run('docker',['port',name,port]).split(':').at(-1));
   for(let i=0;i<60;i++){try{run('docker',['exec',name,...(driver==='postgres'?['pg_isready','-U','postgres']:['mysqladmin','ping','-h','127.0.0.1','-pfixture'])],{stdio:['ignore','pipe','ignore']});break;}catch{await new Promise(r=>setTimeout(r,500));}}
   inputs.push({driver,host:'127.0.0.1',port:assigned,database:'fixture',user:driver==='postgres'?'postgres':'root',password:'fixture',tls:false});
  }
 }
 if(!packaged){vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1420','--strictPort'],{stdio:['ignore','pipe','pipe']});
 await new Promise((resolve_,reject)=>{const timer=setTimeout(()=>reject(Error('Vite startup timeout')),10000);vite.stdout.on('data',d=>{if(String(d).includes('1420')){clearTimeout(timer);resolve_();}});vite.once('exit',code=>reject(Error('Vite exit '+code)));});
 }
 app=spawn(resolve(packaged?'src-tauri/target/release/bundle/macos/PHP IDE.app/Contents/MacOS/php-ide':'src-tauri/target/debug/php-ide'),[],{stdio:['ignore','pipe','pipe'],env:{...process.env,SHELL:'/bin/sh',PHP_IDE_PROJECT:root,PHP_IDE_SMOKE_DOCKER:JSON.stringify(dockerFixture),PHP_IDE_DOCKER_BIN:dockerReal?'docker':resolve('scripts/fake-docker.mjs'),PHP_IDE_DOCKER_FIXTURE_STATE:dockerState,PHP_IDE_STATE_DIR:join(temp,'profile'),PHP_IDE_NATIVE_SMOKE:report,PHP_IDE_SMOKE_DATABASE:JSON.stringify(inputs),PHP_IDE_ACP_AGENT:JSON.stringify({id:'fake',name:'Agente de teste',command:process.execPath,args:[resolve('scripts/fake-acp-agent.mjs')]}),PATH:join(homedir(),'.cargo','bin')+delimiter+process.env.PATH}});
 let logs='';app.stderr.on('data',d=>logs+=String(d));
 // --compare-p0: o renderer pede capturas pelo arquivo de progresso (shot:nome:x:y:w:h).
 if(compareP0){const dir=resolve('.artifacts/compare-p0');await rm(dir,{recursive:true,force:true});for(const f of ['.progress','.partial.json'])await rm(report.replace(/\.json$/,f),{force:true});await mkdir(dir,{recursive:true});const done=new Set();const partial=[];shooter=setInterval(async()=>{let text='';try{text=await readFile(report.replace(/\.json$/,'.progress'),'utf8');}catch{return;}if(text.startsWith('data:')&&!done.has(text)){done.add(text);partial.push(JSON.parse(text.slice(5)));await writeFile(report.replace(/\.json$/,'.partial.json'),JSON.stringify(partial,null,1));return;}const m=/^shot:([\w-]+):(-?\d+):(-?\d+):(\d+):(\d+)$/.exec(text);if(!m||done.has(m[1]))return;done.add(m[1]);try{const id=run('osascript',['-l','JavaScript','-e',`ObjC.import('CoreGraphics');ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll,0))).filter(w=>w.kCGWindowOwnerPID===${app.pid}&&w.kCGWindowLayer===0&&w.kCGWindowName==="PHP IDE"&&w.kCGWindowBounds.Height>200).map(w=>w.kCGWindowNumber)[0]`]);if(!/^\d+$/.test(id))throw Error('janela da IDE não encontrada');/* Só a janela da IDE (-l), nunca uma região da tela que possa mostrar outros apps. */run('screencapture',['-x','-o','-l',id,join(dir,m[1]+'.png')]);}catch(e){console.error('screencapture',m[1],String(e));}},100);}
 const code=await Promise.race([new Promise(r=>app.once('exit',r)),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native smoke timeout. '+logs.slice(-2000))),Number(process.env.PHP_IDE_NATIVE_TIMEOUT_MS)||180000).unref())]);
 const result=JSON.parse(await readFile(report,'utf8'));console.log(JSON.stringify(result,null,2));if(code!==0||!result.ok)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{clearInterval(shooter);app?.kill();vite?.kill();if(composeCleanup){try{run('docker',['--context',composeCleanup.context,'compose','-p',composeCleanup.project,'-f',join(root,'compose.yaml'),'down'],{timeout:30000});}catch{}}for(const name of owned){try{run('docker',typeof name==='string'?['rm','-f',name]:['--context',name.context,'rm','-f',name.name],{timeout:15000});}catch{}}await rm(temp,{recursive:true,force:true});}
