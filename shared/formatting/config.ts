import {globToRegExp} from '../language/plugins/sandbox';

export type Style = {tabSize:number; insertSpaces:boolean; eol:string; finalNewline:boolean; classBrace:'next_line'|'end_of_line'; methodBrace:'next_line'|'end_of_line'};
export type Read = (path:string)=>Promise<string|null>;
export function matches(pattern:string,path:string):boolean{
 const brace=/\{([^{}]+)\}/.exec(pattern);
 if(brace)return brace[1].split(',').some(part=>matches(pattern.slice(0,brace.index)+part+pattern.slice(brace.index+brace[0].length),path));
 return globToRegExp(pattern.includes('/')?pattern:'**/'+pattern).test(path);
}
export function directories(path:string){const parts=path.split('/');parts.pop();return Array.from({length:parts.length+1},(_,n)=>parts.slice(0,n).join('/'));}
export async function readStyle(path:string,read:Read,defaults:{tabSize:number;insertSpaces:boolean},text:string):Promise<Style>{
 let values:Record<string,string>={};
 for(const dir of directories(path)){
  const content=await read((dir?dir+'/':'')+'.editorconfig');if(content===null)continue;
  let active=true;const local=path.slice(dir?dir.length+1:0);const entries:Record<string,string>={};
  for(const line of content.split(/\r?\n/)){
   const trimmed=line.trim();if(!trimmed||/^[#;]/.test(trimmed))continue;
   const section=/^\[(.+)\]$/.exec(trimmed);if(section){active=matches(section[1].replace(/^\//,''),local);continue;}
   const pair=/^([^=]+)=(.*)$/.exec(trimmed);if(!pair)continue;
   const key=pair[1].trim().toLowerCase(),value=pair[2].trim().toLowerCase();
   if(key==='root'&&value==='true')values={};
   else if(active)entries[key]=value;
  }
  for(const [key,value]of Object.entries(entries))if(value==='unset')delete values[key];else values[key]=value;
 }
 const size=Number(values.indent_size==='tab'?values.tab_width:values.indent_size??values.tab_width);
 const brace=(key:string)=>values[key]==='end_of_line'?'end_of_line' as const:'next_line' as const;
 return {tabSize:Number.isInteger(size)&&size>=1&&size<=16?size:defaults.tabSize,insertSpaces:values.indent_style?values.indent_style!=='tab':defaults.insertSpaces,
  eol:values.end_of_line==='crlf'?'\r\n':values.end_of_line==='lf'?'\n':text.includes('\r\n')?'\r\n':'\n',finalNewline:values.insert_final_newline!=='false',
  classBrace:brace('ij_php_class_brace_style'),methodBrace:brace('ij_php_method_brace_style')};
}
