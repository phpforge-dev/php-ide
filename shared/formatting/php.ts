import Engine from 'php-parser';
import {segments} from '../language/php-source';
import type {Style} from './config';

type Token={text:string;kind:string;start:number;end:number;newline:boolean};
const PHPParser=Engine as unknown as {new(options:unknown):import('php-parser').Engine};
const parser=new PHPParser({parser:{version:'8.4',suppressErrors:false},ast:{withPositions:false,withSource:false}});
function tokens(text:string):Token[]{
 const protectedParts=segments(text).filter(s=>s.kind==='string');
 const raw=parser.tokenGetAll(text);const result:Token[]=[];let offset=0,skip=0,newline=false;
 for(const item of raw){
  const value=typeof item==='string'?item:item[1],kind=typeof item==='string'?item:['T_COMMENT','T_DOC_COMMENT'].includes(item[0])?'comment':item[0];const start=offset;offset+=value.length;
  if(start<skip)continue;
  if(kind==='T_WHITESPACE'){newline||=value.includes('\n');continue;}
  const protectedPart=protectedParts.find(s=>s.start===start);
  if(protectedPart){skip=protectedPart.end;result.push({text:text.slice(start,skip),kind:protectedPart.kind,start,end:skip,newline});}
  else result.push({text:kind==='T_OPEN_TAG'?value.trimEnd():value,kind,start,end:offset,newline});
  newline=false;
 }
 return result;
}
/** Independent whitespace printer. The parser validates syntax; it does not supply formatting rules. */
export function formatPhp(text:string,style:Style,range?:{start:number;end:number}):string{
 if(text.length>2*1024*1024)throw Error('PHP: arquivo acima de 2 MB');
 if(!/^\s*<\?php\b/.test(text)||segments(text).some(s=>s.kind==='html'&&text.slice(s.start,s.end).trim()))throw Error('PHP: este recorte formata arquivos PHP puros; HTML/Blade misto não é suportado');
 const ast=JSON.stringify(parser.parseCode(text,'document.php'));const input=tokens(text);
 const unit=style.insertSpaces?' '.repeat(Math.max(1,Math.min(16,style.tabSize))):'\t';
 let out='',indent=0,parens=0,header='',ternary=0;
 const braces:('block'|'expression')[]=[];const arrays:(boolean|'attribute')[]=[];
 const append=(value:string)=>{if(!out||out.endsWith('\n'))out+=unit.repeat(Math.max(0,indent));out+=value;};
 const trim=()=>{out=out.replace(/[ \t]+$/,'');};
 const space=()=>{if(out&&!/[\s]$/.test(out))out+=' ';};
 const line=()=>{trim();if(out&&!out.endsWith('\n'))out+=style.eol;};
 const word=(t:Token|undefined)=>!!t&&(/[\w$\x80-\uffff]$/.test(t.text)||t.kind==='string');
 for(let i=0;i<input.length;i++){
  const token=input[i],v=token.text,prev=input[i-1],next=input[i+1];
  if(token.kind==='T_OPEN_TAG'){append(v);line();continue;}
  if(token.kind==='T_CLOSE_TAG'){line();append(v);continue;}
  if(token.kind==='comment'){
   if(token.newline)line();else space();append(v);
   if(/^\/\/|^#/.test(v)||token.newline||v.startsWith('/**'))line();else space();continue;
  }
  if(['T_CLASS','T_INTERFACE','T_TRAIT','T_ENUM','T_NAMESPACE'].includes(token.kind))header='class';
  if(token.kind==='T_FUNCTION')header=next?.text==='('?'closure':'method';
  if(token.kind==='T_ATTRIBUTE'){line();append(v);arrays.push('attribute');continue;}
  if(v==='{'){
   const expression=prev?.text==='->'||prev?.text==='?->'||prev?.text==='::'||prev?.text==='\\'||prev?.kind==='T_VARIABLE';braces.push(expression?'expression':'block');
   if(expression){trim();append(v);continue;}
   if(header==='class'&&style.classBrace==='next_line'||header==='method'&&style.methodBrace==='next_line')line();else space();
   append('{');indent++;line();header='';continue;
  }
  if(v==='}'){
   if(braces.pop()==='expression'){trim();append(v);continue;}
   indent--;line();append(v);
   if(next&&['else','elseif','catch','finally'].includes(next.text))space();
   else if(!next||![';',',',')',']','->','?->','::','('].includes(next.text))line();continue;
  }
  if(v==='('){if(prev&&['if','elseif','while','for','foreach','switch','catch','match','declare','function','fn'].includes(prev.text))space();else trim();append(v);parens++;continue;}
  if(v===')'){trim();append(v);parens--;continue;}
  if(v==='['){const multiline=next?.newline??false;arrays.push(multiline);if(prev?.text==='=')space();else if(!prev||!word(prev)&&![')',']'].includes(prev.text))space();else trim();append(v);if(multiline){indent++;line();}continue;}
  if(v===']'){const array=arrays.pop();if(array===true){indent--;line();}else trim();append(v);if(array==='attribute')line();continue;}
  if(v===';'){trim();append(v);header='';if(parens)space();else line();continue;}
  if(v===','){trim();append(v);if(arrays.at(-1)===true&&!parens)line();else space();continue;}
  if(['->','?->','::','\\'].includes(v)){trim();append(v);continue;}
  if(v===':'){if(ternary){space();ternary--;}else trim();append(v);space();continue;}
  if(v==='?'){if(prev&&(word(prev)||[')',']'].includes(prev.text))){space();append(v);space();ternary++;}else append(v);continue;}
  if(v==='!'||v==='~'||v==='@'||v==='++'||v==='--'){append(v);continue;}
  if(/^(?:=|=>|\+|-|\*|\/|\.|%|==|===|!=|!==|<|>|<=|>=|\?\?|&&|\|\||&|\||\^|\+=|-=|\*=|\/=|\.=|\?\?=|<<|>>|\*\*)$/.test(v)){
   const unary=(v==='+'||v==='-')&&(!prev||['(','[','=',',','return','=>'].includes(prev.text));
   if(unary){append(v);continue;}space();append(v);space();continue;
  }
  if(prev&&(word(prev)||prev.text==='}'||prev.text===')'&&word(token)))space();
  append(v);
 }
 out=out.trimEnd()+(style.finalNewline?style.eol:'');
 if(JSON.stringify(parser.parseCode(out,'document.php'))!==ast)throw Error('PHP: formatação recusada porque altera a estrutura do código');
 const printed=tokens(out);
 if(input.length!==printed.length||input.some((t,i)=>t.kind!==printed[i].kind||t.text!==printed[i].text))throw Error('PHP: formatação recusada porque altera tokens');
 if(range){
  // Apply only whitespace gaps wholly inside the requested selection; tokens remain byte-identical.
  const changes:{start:number;end:number;text:string}[]=[];
  for(let i=0;i<=input.length;i++){
   const start=i?input[i-1].end:0,end=i<input.length?input[i].start:text.length;
   const a=i?printed[i-1].end:0,b=i<printed.length?printed[i].start:out.length;
   if(start>=range.start&&end<=range.end)changes.push({start,end,text:out.slice(a,b)});
  }
  let partial=text;for(const change of changes.reverse())partial=partial.slice(0,change.start)+change.text+partial.slice(change.end);
  if(JSON.stringify(parser.parseCode(partial,'document.php'))!==ast)throw Error('PHP: seleção não pode ser formatada com segurança');
  return partial;
 }
 return out;
}
