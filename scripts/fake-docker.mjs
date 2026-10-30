#!/usr/bin/env node
// Synthetic CLI for isolated native UI tests; never used by normal app launches.
import {readFileSync,writeFileSync} from 'node:fs';
const file=process.env.PHP_IDE_DOCKER_FIXTURE_STATE;
if(!file)process.exit(2);
let args=process.argv.slice(2);let context='fixture-local';if(args[0]==='--context'){context=args[1];args=args.slice(2);}
const json=value=>process.stdout.write(JSON.stringify(value)+'\n');const save=state=>writeFileSync(file,JSON.stringify(state));
if(args[0]==='context'&&args[1]==='ls'){json({Name:'fixture-local',Current:true,DockerEndpoint:'unix:///fixture/docker.sock'});json({Name:'fixture-offline',Current:false,DockerEndpoint:'unix:///fixture/offline.sock'});process.exit(0);}
if(context!=='fixture-local'){console.error('Fixture engine offline');process.exit(1);}
const state=JSON.parse(readFileSync(file,'utf8'));const id=args.at(-1);
if(args[0]==='version')json({Version:'fixture-engine',Os:'linux'});
else if(args[0]==='container'&&args[1]==='ls'){for(const c of state.containers)json(c);}
else if(args[0]==='image'&&args[1]==='ls'){for(const i of state.images)json(i);}
else if(args[0]==='volume')json({Name:'fixture-data',Driver:'local'});
else if(args[0]==='network')json({ID:'abc123',Name:'bridge',Driver:'bridge'});
else if(args[0]==='logs'){console.log('DOCKER_FIXTURE_READY');console.error('DOCKER_FIXTURE_STDERR');}
else if(args[0]==='container'){
 const c=state.containers.find(c=>c.ID===id);if(!c){console.error('container not found');process.exit(1);}
 if(args[1]==='rm'){if(c.State==='running'){console.error('container is running');process.exit(1);}state.containers=state.containers.filter(c=>c.ID!==id);}else{c.State=args[1]==='stop'?'exited':'running';c.Status=c.State==='running'?'Up 1 second':'Exited (0)';}save(state);console.log(id);
}else if(args[0]==='image'&&args[1]==='pull'){const reference=args[2];if(reference==='slow:fixture'){console.log('PULL_FIXTURE_WAIT');await new Promise(()=>setInterval(()=>console.log('Pulling layer…'),200));}state.images.push({ID:'sha256:'+'b'.repeat(64),Repository:reference.split(':')[0],Tag:reference.split(':')[1]??'latest',Size:'8 MB'});save(state);console.log('Pulled '+reference);}
else if(args[0]==='compose'){
 if(args.includes('config'))console.log('app');
 else if(args.includes('up')){const service=args.at(-1)==='-d'?'app':args.at(-1);state.containers.push({ID:(service==='app'?'c':'e').repeat(64),Names:'fixture-compose-'+service+'-1',Image:'php:8.3-cli',State:'running',Status:'Up',Ports:''});save(state);console.log('Compose started');}
 else if(args.includes('stop')){for(const c of state.containers)if(c.Names.includes('fixture-compose')){c.State='exited';c.Status='Exited (0)';}save(state);console.log('Compose stopped');}
 else if(args.includes('build'))console.log('Fixture build completed');
 else process.exit(2);
}else if(args[0]==='exec'){
 console.log('DOCKER_SHELL_READY');process.stdin.setEncoding('utf8');let input='';process.stdin.on('data',s=>{input+=s;if(/[\r\n]/.test(input)){if(input.includes('DOCKER_EXEC'))console.log('IDE_DOCKER_EXEC');if(input.includes('exit'))process.exit(0);input='';}});
}else{console.error('Unsupported fixture command '+JSON.stringify(args));process.exit(2);}
