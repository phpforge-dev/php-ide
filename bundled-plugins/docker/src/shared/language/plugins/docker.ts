import { isAlias, isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml';
import { isComposeDocument, isDockerDocument, isDockerfilePath, isYamlPath } from '../../docker-document';
import { position } from '../php-source';
import { CompletionKind, type CodeSite, type IdePlugin, type PluginDiagnostic, type ProjectFiles } from './api';
import { readEnv } from './dotenv';

export const dockerInstructions: Record<string, string> = {
 FROM: 'Imagem base ou estágio anterior. FROM imagem AS nome', RUN: 'Executa um comando durante o build.',
 CMD: 'Comando padrão do container.', LABEL: 'Metadados da imagem.', EXPOSE: 'Documenta uma porta do container.',
 ENV: 'Define variáveis de ambiente da imagem.', ADD: 'Adiciona arquivos ou recursos ao build.', COPY: 'Copia arquivos; --from seleciona outro estágio ou imagem.',
 ENTRYPOINT: 'Executável principal do container.', VOLUME: 'Declara um ponto de montagem.', USER: 'Usuário das próximas instruções e do processo.',
 WORKDIR: 'Diretório de trabalho.', ARG: 'Argumento de build.', ONBUILD: 'Instrução executada ao usar esta imagem como base.',
 STOPSIGNAL: 'Sinal para parar o container.', HEALTHCHECK: 'Comando para verificar a saúde do container.', SHELL: 'Shell usado pelas instruções.',
 MAINTAINER: 'Metadado legado; prefira LABEL.'
};
export const composeRoot: Record<string, string> = {
 services: 'Serviços da aplicação.', name: 'Nome do projeto Compose.', volumes: 'Volumes nomeados.', networks: 'Redes da aplicação.',
 configs: 'Configurações compartilhadas.', secrets: 'Segredos referenciados pelos serviços.', include: 'Inclui outros arquivos Compose.', version: 'Campo legado opcional.'
};
export const composeService: Record<string, string> = {
 image:'Imagem do serviço.', build:'Contexto ou configuração de build.', ports:'Portas publicadas, por exemplo "8080:80".',
 environment:'Variáveis de ambiente (mapa ou lista).', env_file:'Arquivo(s) de variáveis de ambiente.', volumes:'Montagens do serviço.',
 depends_on:'Dependências entre serviços.', networks:'Redes do serviço.', command:'Substitui o comando padrão.', entrypoint:'Substitui o entrypoint.',
 restart:'Política: no, always, on-failure ou unless-stopped.', healthcheck:'Verificação de saúde.', container_name:'Nome explícito do container.',
 working_dir:'Diretório de trabalho.', user:'Usuário do processo.', profiles:'Perfis que ativam o serviço.', expose:'Portas internas.',
 hostname:'Hostname do container.', labels:'Metadados.', secrets:'Segredos do serviço.', configs:'Configurações do serviço.',
 deploy:'Configuração de implantação.', platform:'Plataforma alvo.', pull_policy:'Política de download de imagem.', extends:'Herda configuração de outro serviço.',
 extra_hosts:'Entradas adicionais de hosts.', dns:'Servidores DNS.', init:'Inicializa um processo init.', tty:'Aloca terminal.', stdin_open:'Mantém stdin aberto.',
 privileged:'Modo privilegiado.', read_only:'Sistema de arquivos somente leitura.', tmpfs:'Montagens temporárias.', cap_add:'Capabilities adicionais.', cap_drop:'Remove capabilities.',
 devices:'Dispositivos disponíveis.', logging:'Configuração de logs.', stop_grace_period:'Tempo para parada.', stop_signal:'Sinal para parada.',
 mem_limit:'Limite de memória.', cpus:'Limite de CPU.', ulimits:'Limites do sistema.', network_mode:'Modo de rede.', ipc:'Modo IPC.', pid:'Modo PID.',
 security_opt:'Opções de segurança.', develop:'Configuração de desenvolvimento e watch.'
};
const buildKeys = { context:'Diretório do contexto de build.', dockerfile:'Dockerfile relativo ao contexto.', args:'Argumentos de build.', target:'Estágio final do build.', platforms:'Plataformas alvo.', cache_from:'Fontes de cache.', cache_to:'Destinos de cache.', secrets:'Segredos de build.', ssh:'Agentes SSH para build.', additional_contexts:'Contextos adicionais.', no_cache:'Desativa o cache.', pull:'Atualiza imagens base.', labels:'Metadados de build.', network:'Rede para instruções RUN.', dockerfile_inline:'Dockerfile embutido.' };
const healthKeys = { test:'Comando de teste.', interval:'Intervalo entre testes.', timeout:'Timeout do teste.', retries:'Tentativas.', start_period:'Tempo inicial de preparação.', start_interval:'Intervalo inicial.', disable:'Desativa o healthcheck.' };
const maxSize = 1024 * 1024;
const range = (text: string, from: number, to = from + 1) => ({ start: position(text, from), end: position(text, Math.max(from + 1, to)) });
const parse = (text: string) => parseDocument(text, { prettyErrors: false, uniqueKeys: true, merge: true });
const scalar = (node: unknown) => isScalar(node) ? String(node.value ?? '') : '';
const map = (node: unknown): YAMLMap | undefined => isMap(node) ? node : undefined;
const nodeOffset = (node: unknown) => isScalar(node) ? node.range?.[0] ?? 0 : 0;
const loc = (files: ProjectFiles, path: string, text: string, node: unknown) => ({ uri: files.uri(path), range: range(text, nodeOffset(node), nodeOffset(node) + scalar(node).length) });

/** Logical instructions, ignoring shell continuations and heredoc bodies. */
export function dockerLines(text: string) {
 const result: { name: string; args: string; argsOffset: number; offset: number; length: number }[] = [];
 let offset = 0; let continued = false; let escape = '\\'; let heredocs: string[] = [];
 for (const raw of text.split('\n')) {
  const line = raw.replace(/\r$/, '');
  const at = offset; offset += raw.length + 1;
  if (heredocs.length) { if (line.trim() === heredocs[0]) heredocs.shift(); continue; }
  const directive = /^\s*#\s*escape\s*=\s*([`\\])/.exec(line); if (directive && !result.length) escape = directive[1];
  if (/^\s*(?:#|$)/.test(line)) continue;
  const wasContinued = continued;continued = line.trimEnd().endsWith(escape);
  if (wasContinued) { if (['RUN','COPY','ADD'].includes(result.at(-1)?.name ?? '')) heredocs.push(...[...line.matchAll(/<<-?['"]?([A-Za-z_][\w]*)['"]?/g)].map(m=>m[1])); continue; }
  const m = /^\s*([A-Za-z]+)\b(.*)$/.exec(line); if (!m) continue;
  result.push({ name:m[1].toUpperCase(), args:m[2].trim(), argsOffset:at + line.length - m[2].length + m[2].length - m[2].trimStart().length, offset:at + line.indexOf(m[1]), length:m[1].length });
  if (['RUN','COPY','ADD'].includes(m[1].toUpperCase())) heredocs = [...line.matchAll(/<<-?['"]?([A-Za-z_][\w]*)['"]?/g)].map(m=>m[1]);
 }
 return result;
}
const stages = (text: string) => dockerLines(text).flatMap(line => { const m = /\s+AS\s+([\w.-]+)\s*$/i.exec(line.args); return line.name === 'FROM' && m ? [{ name:m[1], offset:line.argsOffset + line.args.lastIndexOf(m[1]) }] : []; });
/** Ancestors for block-style completion only; YAML AST handles validation/navigation. */
function context(text: string, offset: number) {
 const start=text.lastIndexOf('\n',offset-1)+1, line=text.slice(start,offset), indent=/^\s*/.exec(line)![0].length;
 const parents: string[]=[];let ceiling=indent;
 const before=text.slice(0,start).split('\n');
 for(let i=before.length-1;i>=0;i--){const m=/^( *)([\w.-]+):(?:\s*(.*))?$/.exec(before[i]);if(!m||m[1].length>=ceiling)continue;parents.unshift(m[2]);ceiling=m[1].length;}
 return { start,line,parents,indent };
}

export class DockerPlugin implements IdePlugin {
 readonly id='docker'; readonly name='Docker';
 documents(path: string) { return isDockerfilePath(path) || isYamlPath(path); }
 activationChanged(path: string) { return this.documents(path); }
 async detect(files: ProjectFiles) {
  const paths=await files.list('',name=>isDockerfilePath(name)||isYamlPath(name));
  if(paths.some(p=>isDockerDocument(p)))return {};
  for(const p of paths.slice(0,100)){const text=await files.read(p);if(text!==null&&isComposeDocument(p,text))return {};}
  return null;
 }
 async completeCode(site: CodeSite, files: ProjectFiles) {
  if(!isDockerDocument(site.path,site.text)||site.text.length>maxSize)return null;
  const {start,line,parents}=context(site.text,site.offset);
  if(/^\s*#/.test(line))return null;
  const word=/[\w.-]*$/.exec(line)![0];const from=site.offset-word.length;
  if(isDockerfilePath(site.path)){
   if(/^\s*[A-Za-z]*$/.test(line))return {from,items:Object.entries(dockerInstructions).map(([label,detail])=>({label,detail,kind:CompletionKind.Keyword,insertText:label+' '}))};
   if(/^(?:\s*COPY\s+.*--from=|\s*FROM\s+)([\w.-]*)$/i.test(line))return {from,items:stages(site.text.slice(0,start)).map(s=>({label:s.name,kind:CompletionKind.Reference,detail:'Estágio de build'}))};
   return null;
  }
  const variable=/(?<!\$)\$\{([A-Za-z_][\w]*|)$/.exec(line);
  if(variable)return {from:site.offset-variable[1].length,items:[...(await readEnv(files)).values()].map(e=>({label:e.key,detail:e.file,kind:CompletionKind.Constant}))};
  const doc=parse(site.text),root=map(doc.contents),services=map(root?.get('services',true));
  if(parents.includes('depends_on') && /^\s*(?:-\s*)?[\w.-]*$/.test(line))return {from,items:(services?.items??[]).map(p=>({label:scalar(p.key),kind:CompletionKind.Reference,detail:'Serviço Compose'}))};
  if(!/^\s*[\w.-]*$/.test(line))return null;
  let keys:Record<string,string>|undefined;
  if(!parents.length)keys=composeRoot;
  else if(parents.length===2&&parents[0]==='services')keys=composeService;
  else if(parents.length===3&&parents[0]==='services'&&parents[2]==='build')keys=buildKeys;
  else if(parents.length===3&&parents[0]==='services'&&parents[2]==='healthcheck')keys=healthKeys;
  if(!keys)return null;
  return {from,items:Object.entries(keys).map(([label,detail])=>({label,detail,kind:CompletionKind.Property,insertText:label+': '}))};
 }
 async defineCode(site: CodeSite, files: ProjectFiles) {
  if(!isDockerDocument(site.path,site.text)||site.text.length>maxSize)return null;
  if(isDockerfilePath(site.path)){
   const start=site.text.lastIndexOf('\n',site.offset-1)+1,line=site.text.slice(start,site.text.indexOf('\n',start)<0?undefined:site.text.indexOf('\n',start));
   const m=/^\s*(?:COPY\s+.*?--from=|FROM\s+)([\w.-]+)/i.exec(line);if(!m)return [];
   const from=start+m[0].lastIndexOf(m[1]);if(site.offset<from||site.offset>from+m[1].length)return [];
   const stage=stages(site.text.slice(0,start)).find(s=>s.name===m[1]);return stage?[{uri:files.uri(site.path),range:range(site.text,stage.offset,stage.offset+stage.name.length)}]:[];
  }
  const doc=parse(site.text),root=map(doc.contents),services=map(root?.get('services',true));
  if(!services)return [];
  for(const service of services.items){
   const body=map(service.value),deps=body?.get('depends_on',true);const refs=isSeq(deps)?deps.items:isMap(deps)?deps.items.map(p=>p.key):[];
   for(const ref of refs){const at=nodeOffset(ref),name=scalar(ref);if(site.offset<at||site.offset>at+name.length)continue;const target=services.items.find(p=>scalar(p.key)===name);return target?[loc(files,site.path,site.text,target.key)]:[];}
  }
  return [];
 }
 async hover(site: CodeSite) {
  if(!isDockerDocument(site.path,site.text))return null;
  const start=site.text.lastIndexOf('\n',site.offset-1)+1,line=site.text.slice(start).split('\n')[0];
  const word=isDockerfilePath(site.path)?/^\s*([A-Za-z]+)/.exec(line):/^\s*([\w.-]+):/.exec(line);
  if(!word)return null;const at=start+word[0].indexOf(word[1]);if(site.offset<at||site.offset>at+word[1].length)return null;
  const detail=isDockerfilePath(site.path)?dockerInstructions[word[1].toUpperCase()]:composeService[word[1]]??composeRoot[word[1]];
  return detail?{contents:'**'+word[1]+'** — '+detail,range:range(site.text,at,at+word[1].length)}:null;
 }
 async diagnose(path: string, text: string): Promise<PluginDiagnostic[]> {
  if(!isDockerDocument(path,text))return [];
  const out:PluginDiagnostic[]=[];
  const add=(from:number,to:number,code:string,message:string,severity:'warning'|'error'='error')=>out.push({range:range(text,from,to),code,message,severity});
  if(text.length>maxSize){add(0,1,'docker.size','Análise Docker limitada a arquivos de até 1 MiB.','warning');return out;}
  if(isDockerfilePath(path)){
   let from=false;
   for(const instruction of dockerLines(text)){
    const {name,args,offset,length}=instruction;
    if(!dockerInstructions[name]){add(offset,offset+length,'docker.instruction','Instrução Dockerfile desconhecida.');continue;}
    if(!args)add(offset,offset+length,'docker.arguments','Esta instrução precisa de argumentos.');
    if(name==='FROM')from=true;
    else if(!from&&name!=='ARG')add(offset,offset+length,'docker.from','Adicione FROM antes desta instrução.');
   }
   return out;
  }
  const doc=parse(text);
  for(const error of doc.errors){add(error.pos[0],error.pos[1],'docker.yaml.'+error.code,'YAML inválido: '+(error.code==='DUPLICATE_KEY'?'chave duplicada.':'revise a sintaxe nesta posição.'));}
  if(doc.errors.length)return out;
  const root=map(doc.contents);if(!root){if(text.trim())add(0,1,'docker.compose.root','Compose deve ser um mapa YAML.');return out;}
  for(const pair of root.items){const key=scalar(pair.key);if(!composeRoot[key]&&!key.startsWith('x-'))add(nodeOffset(pair.key),nodeOffset(pair.key)+key.length,'docker.compose.key','Propriedade desconhecida no nível principal do Compose.','warning');}
  const rawServices=root.get('services',true);
  // Partial override/include files may omit services; never require image/build here.
  if(rawServices!==undefined&&!isMap(rawServices)){add(nodeOffset(root.items.find(p=>scalar(p.key)==='services')?.key),8,'docker.compose.services','services deve ser um mapa de serviços.');return out;}
  for(const service of map(rawServices)?.items??[]){
   if(isAlias(service.value))continue;
   if(!isMap(service.value)){add(nodeOffset(service.key),nodeOffset(service.key)+scalar(service.key).length,'docker.compose.service','A definição de um serviço deve ser um mapa.');continue;}
   for(const pair of service.value.items){
    const key=scalar(pair.key),value=pair.value;if(isAlias(value))continue;let invalid=false;
    if(['ports','volumes','expose','profiles','cap_add','cap_drop'].includes(key))invalid=!isSeq(value);
    if(['environment','depends_on','networks'].includes(key))invalid=!isMap(value)&&!isSeq(value);
    if(key==='build')invalid=!isMap(value)&&!(isScalar(value)&&typeof value.value==='string');
    if(['image','container_name','working_dir'].includes(key))invalid=!(isScalar(value)&&typeof value.value==='string');
    if(invalid)add(nodeOffset(pair.key),nodeOffset(pair.key)+key.length,'docker.compose.type','Formato incompatível com esta propriedade Compose.');
   }
  }
  return out;
 }
}
