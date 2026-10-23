import { phpTokens, type PhpToken } from './language/php-source';

export type PhpHighlight = { offset: number; length: number; kind: 'variable' | 'method' | 'function' | 'constructor' | 'builtin' };
export type PhpCallable = { name: string; offset: number; length: number; canFade: boolean };
/** Local syntactic categories, not inferred runtime types. Strings/comments/HTML are excluded. */
export function phpEditorAnalysis(text: string): { highlights: PhpHighlight[]; callables: PhpCallable[] } {
 const tokens = phpTokens(text);
 const highlights: PhpHighlight[] = [], callables: PhpCallable[] = [];
 const classes: {depth:number;contract:boolean;trait:boolean;pending:boolean}[]=[];
 let depth=0;
 const lower=(token:PhpToken|undefined)=>token?.value.toLowerCase();
 const add=(token:PhpToken,kind:PhpHighlight['kind'],start=token.offset,length=token.value.length)=>highlights.push({offset:start,length,kind});
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i],prev=tokens[i-1],next=tokens[i+1],value=lower(token);
  if(token.type==='string')continue;
  if(token.type==='word'&&['class','interface','trait','enum'].includes(value!)&&prev?.value!=='::'&&prev?.value!=='->'){
   let end=i+1;while(end<tokens.length&&!['{',';'].includes(tokens[end].value))end++;
   const head=tokens.slice(i,end).map(t=>lower(t));
   classes.push({depth:depth+1,contract:value==='interface'||head.includes('extends')||head.includes('implements'),trait:value==='trait',pending:true});
  }
  if(token.value==='{'){depth++;if(classes.at(-1)?.pending)classes.at(-1)!.pending=false;}
  if(token.value==='}'){if(classes.at(-1)?.depth===depth)classes.pop();depth--;}
  if(token.type!=='word')continue;
  if(prev?.value==='$'){add(token,'variable',prev.offset,token.offset+token.value.length-prev.offset);continue;}
  if(value==='function'){
   const name=tokens[i+1]?.value==='&'?tokens[i+2]:next;
   if(!name||name.type!=='word')continue;
   let j=tokens.indexOf(name)+1,paren=0;
   for(;j<tokens.length;j++){const v=tokens[j].value;if(v==='(')paren++;if(v===')')paren--;if(paren===0&&['{',';'].includes(v))break;}
   const owner=classes.at(-1);const method=!!owner&&depth===owner.depth;
   // Abstract/interface signatures and magic entry points are never classified as unused.
   if(tokens[j]?.value==='{'){
    const modifiers=tokens.slice(Math.max(0,i-4),i).map(t=>lower(t));
    callables.push({name:name.value,offset:name.offset,length:name.value.length,canFade:!name.value.startsWith('__')&&(!method||(!owner!.contract&&!owner!.trait)||modifiers.includes('private'))});
   }
   add(name,method?'method':'function');continue;
  }
  if(lower(prev)==='function'||(prev?.value==='&'&&lower(tokens[i-2])==='function'))continue;
  if((prev?.value==='->'||prev?.value==='::')&&next?.value==='('){add(token,'method');continue;}
  if(lower(prev)==='new'&&value!=='class'){add(token,'constructor');continue;}
  if(['string','int','float','bool','void','never','mixed','object','iterable'].includes(value!)&&[':', '?', '|', '&', '(', ','].includes(prev?.value??'')){add(token,'builtin');}
 }
 return {highlights:highlights.sort((a,b)=>a.offset-b.offset),callables};
}
