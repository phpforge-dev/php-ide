import { isBashDocument, isBashPath } from '../../bash-document';
import { position } from '../php-source';
import { CompletionKind, type CodeSite, type IdePlugin, type ProjectFiles } from './api';

export const bashWords: Record<string,string> = {
 if:'Inicia uma condição; termina com fi.', then:'Comandos executados quando a condição tem sucesso.', elif:'Condição alternativa.', else:'Ramo alternativo.', fi:'Encerra if.',
 for:'Laço sobre uma lista de valores.', in:'Lista de valores de for ou padrões de case.', do:'Inicia o corpo de um laço.', done:'Encerra um laço.',
 while:'Repete enquanto a condição tem sucesso.', until:'Repete até a condição ter sucesso.', case:'Seleciona um ramo por padrão.', esac:'Encerra case.',
 function:'Declara uma função Bash.', select:'Menu de seleção Bash.', time:'Mede o tempo de um comando.',
 echo:'Escreve argumentos na saída padrão.', printf:'Formata e escreve valores.', read:'Lê uma linha de entrada.', cd:'Altera o diretório atual.', pwd:'Mostra o diretório atual.',
 export:'Exporta variáveis para processos filhos.', local:'Declara variáveis locais a uma função.', declare:'Declara variáveis e atributos Bash.', readonly:'Marca variáveis como somente leitura.',
 source:'Lê comandos de outro arquivo no shell atual.', return:'Retorna de uma função ou script carregado.', exit:'Encerra o shell.', set:'Configura opções e parâmetros posicionais.',
 shopt:'Configura opções adicionais do Bash.', trap:'Define tratamento de sinais e eventos.', unset:'Remove variáveis ou funções.', test:'Avalia uma expressão condicional.',
 exec:'Substitui o shell por outro programa.', eval:'Interpreta argumentos como comandos.', shift:'Desloca parâmetros posicionais.', getopts:'Lê opções de linha de comando.',
 break:'Interrompe um laço.', continue:'Avança para a próxima iteração.', true:'Retorna sucesso.', false:'Retorna falha.', wait:'Aguarda processos filhos.',
 command:'Executa um comando sem resolução por função.', type:'Mostra como um nome de comando é resolvido.', alias:'Define um alias.', unalias:'Remove um alias.',
};
const maxSize = 1024 * 1024;
type Reference = {name:string;offset:number;length:number};
/** A small lexical index; syntax itself is checked by the system shell, not regexes. */
export function bashIndex(text: string) {
 const chars:string[]=new Array(text.length).fill(' '); // UTF-16 offsets match Monaco.
 const refs:Reference[]=[];const contexts:string[]=new Array(text.length+1).fill('code');
 let quote='';let heredocs:{name:string;tabs:boolean}[]=[];let lineStart=0;
 const variable=(i:number)=>{const m=/^\$(?:\{([A-Za-z_]\w*)|([A-Za-z_]\w*))/.exec(text.slice(i));if(m)refs.push({name:m[1]??m[2],offset:i+(m[1]?2:1),length:(m[1]??m[2]).length});};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(i===lineStart&&heredocs.length){const end=text.indexOf('\n',i),last=end<0?text.length:end;const raw=text.slice(i,last).replace(/\r$/,'');const h=heredocs[0];if((h.tabs?raw.replace(/^\t+/,''):raw)===h.name)heredocs.shift();for(let j=i;j<last;j++)contexts[j]='heredoc';i=last-1;if(last===text.length)break;continue;}
  if(c==='\n'){chars[i]='\n';lineStart=i+1;contexts[i]=quote||'code';continue;}
  contexts[i]=quote||'code';
  if(c==='\\'&&quote!=="'"){if(i+1<text.length){contexts[i+1]='escape';if(text[i+1]==='\n'){chars[i+1]='\n';lineStart=i+2;}i++;}continue;}
  if(quote){if(c===quote)quote='';else if(c==='$'&&quote==='"')variable(i);continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='#'&&(i===0||/[\s;|&()]/.test(text[i-1]))){const end=text.indexOf('\n',i),last=end<0?text.length:end;for(let j=i;j<last;j++)contexts[j]='comment';i=last-1;continue;}
  if(c==='$')variable(i);
  if(c==='<'&&text[i+1]==='<'&&text[i+2]!=='<'&&text[i-1]!=='<'){
   const match=/^<<(-?)[ \t]*(?:'([^']+)'|"([^"]+)"|([A-Za-z_]\w*))/.exec(text.slice(i));if(match)heredocs.push({name:match[2]??match[3]??match[4],tabs:!!match[1]});
  }
  chars[i]=c;
 }
 contexts[text.length]=quote||'code';
 const code=chars.join('');
 const functions:Reference[]=[];
 for(const m of code.matchAll(/(?:^|[\n;{}])\s*(?:function\s+([A-Za-z_]\w*)(?:\s*\(\s*\))?|([A-Za-z_]\w*)\s*\(\s*\))\s*\{/g)){const name=m[1]??m[2];const offset=m.index!+m[0].indexOf(name);functions.push({name,offset,length:name.length});}
 const variables:Reference[]=[];
 for(const m of code.matchAll(/(?:^|[\n;({])\s*(?:(?:export|local|declare|typeset|readonly)\s+(?:-[A-Za-z]+\s+)?)?([A-Za-z_]\w*)(?:\+?=|(?=\s*(?:$|[;\n])))/g)){const name=m[1];if(!/=/.test(m[0])&&!/\b(?:export|local|declare|typeset|readonly)\s/.test(m[0]))continue;const offset=m.index!+m[0].lastIndexOf(name);variables.push({name,offset,length:name.length});}
 return {code,contexts,refs,functions,variables};
}
const location=(files:ProjectFiles,path:string,text:string,symbol:Reference)=>({uri:files.uri(path),range:{start:position(text,symbol.offset),end:position(text,symbol.offset+symbol.length)}});

export class BashPlugin implements IdePlugin {
 readonly id='bash';readonly name='Bash';
 documents() { return true; }
 activationChanged(path:string) { return isBashPath(path)||!path.split('/').pop()!.includes('.'); }
 async detect(files:ProjectFiles){
  const paths=await files.list('',()=>true);if(paths.some(isBashPath))return {};
  for(const path of paths.filter(p=>!p.split('/').pop()!.includes('.')).slice(0,100)){const text=await files.read(path);if(text!==null&&isBashDocument(path,text))return {};}
  return null;
 }
 async completeCode(site:CodeSite){
  if(!isBashDocument(site.path,site.text)||site.text.length>maxSize)return null;
  const index=bashIndex(site.text),state=index.contexts[Math.max(0,site.offset-1)];
  if(["'",'comment','heredoc','escape'].includes(state))return null;
  const before=site.text.slice(0,site.offset),variable=/\$(?:\{([A-Za-z_]*\w*)|([A-Za-z_]*\w*))$/.exec(before);
  if(variable){const prefix=variable[1]??variable[2];return {from:site.offset-prefix.length,items:[...new Set(index.variables.map(v=>v.name))].map(label=>({label,kind:CompletionKind.Variable,detail:'Variável neste arquivo'}))};}
  if(state==='"')return null;
  const prefix=/[A-Za-z_][\w]*$/.exec(before)?.[0]??'',from=site.offset-prefix.length;
  const line=index.code.slice(index.code.lastIndexOf('\n',from-1)+1,from);
  if(!/^(?:.*[;|&{}]\s*)?\s*(?:(?:then|do|else|!|command)\s+)?$/.test(line))return null;
  return {from,items:[...index.functions.map(f=>({label:f.name,kind:CompletionKind.Function,detail:'Função neste arquivo'})),...Object.entries(bashWords).map(([label,detail])=>({label,detail,kind:CompletionKind.Keyword}))]};
 }
 async defineCode(site:CodeSite,files:ProjectFiles){
  if(!isBashDocument(site.path,site.text)||site.text.length>maxSize)return null;
  const index=bashIndex(site.text),ref=index.refs.find(r=>site.offset>=r.offset&&site.offset<=r.offset+r.length);
  if(ref){const candidates=index.variables.filter(v=>v.name===ref.name);const symbol=candidates.filter(v=>v.offset<=ref.offset).at(-1)??candidates[0];return symbol?[location(files,site.path,site.text,symbol)]:[];}
  const word=/[A-Za-z_]\w*/g;for(const m of index.code.matchAll(word)){if(site.offset<m.index!||site.offset>m.index!+m[0].length)continue;const from=m.index!;const line=index.code.slice(index.code.lastIndexOf('\n',from-1)+1,from);if(!/^(?:.*[;|&{}]\s*)?\s*(?:(?:then|do|else|!|command)\s+)?$/.test(line))return [];const f=index.functions.find(f=>f.name===m[0]);return f?[location(files,site.path,site.text,f)]:[];}
  return [];
 }
 async hover(site:CodeSite){
  if(!isBashDocument(site.path,site.text)||site.text.length>maxSize)return null;
  const index=bashIndex(site.text);for(const m of index.code.matchAll(/[A-Za-z_]\w*/g)){if(site.offset<m.index!||site.offset>m.index!+m[0].length)continue;const detail=bashWords[m[0]];return detail?{contents:'**'+m[0]+'** — '+detail}:null;}
  return null;
 }
}
