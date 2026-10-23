type Language={id:string;name:string;messages:Record<string,string>};
const catalogs=Object.values(import.meta.glob<Language>('./locales/*.json',{eager:true,import:'default'}));
export const languages=catalogs.map(({id,name})=>({id,name}));
const fallback='pt-BR';
export function preferredLanguage():string{try{const id=localStorage.getItem('php-ide-language');return catalogs.some(c=>c.id===id)?id!:fallback;}catch{return fallback;}}
export const activeLanguage=preferredLanguage();
document.documentElement.lang=activeLanguage;
export function saveLanguage(id:string):boolean{if(!catalogs.some(c=>c.id===id))return false;try{localStorage.setItem('php-ide-language',id);return true;}catch{return false;}}
function interpolate(value:string,args:unknown[]){return value.replace(/\{(\d+)\}/g,(token,index)=>Number(index)<args.length?String(args[Number(index)]):token);}
export function t(source:string,...args:unknown[]):string{return interpolate(catalogs.find(c=>c.id===activeLanguage)?.messages[source]??source,args);}
function template(parts:TemplateStringsArray,values:unknown[]){return parts.reduce((value,part,index)=>value+part+(index<values.length?`{${index}}`:''),'');}
export function msg(parts:TemplateStringsArray,...values:unknown[]):string{return t(template(parts,values),...values);}
/** Only static markup is localized; interpolated names/code/data are inserted afterwards. */
export function html(source:string|TemplateStringsArray,...values:unknown[]):string{
 const markup=typeof source==='string'?source:template(source,values);
 const localized=markup.split(/(<[^>]*>)/g).map(part=>part.startsWith('<')?part.replace(/\b(aria-label|title|placeholder|alt|data-prompt)=(["'])(.*?)\2/g,(_all,key,quote,text)=>`${key}=${quote}${t(text)}${quote}`):part.replace(/^(\s*)([\s\S]*?)(\s*)$/,(_all,before,text,after)=>before+t(text)+after)).join('');
 return interpolate(localized,values);
}
export function requestLanguageReload():boolean{if(!window.dispatchEvent(new Event('ide-before-language-change',{cancelable:true})))return false;location.reload();return true;}
export function mountLanguageSettings(parent:HTMLElement){
 const section=document.createElement('section');section.className='language-settings';
 section.innerHTML=html`<div class="appearance-divider"></div><label for="interface-language">Idioma da interface</label><select id="interface-language"></select><p>Reabra a interface para aplicar. Seus arquivos precisam estar salvos.</p><button type="button" id="apply-language">Aplicar idioma agora</button><p id="language-feedback" role="status"></p>`;
 const select=section.querySelector<HTMLSelectElement>('select')!;for(const language of languages)select.add(new Option(language.name,language.id));select.value=preferredLanguage();
 const button=section.querySelector<HTMLButtonElement>('button')!;const feedback=section.querySelector<HTMLElement>('#language-feedback')!;button.disabled=select.value===activeLanguage;
 select.onchange=()=>{if(!saveLanguage(select.value)){feedback.textContent=t('Não foi possível salvar o idioma.');return;}button.disabled=select.value===activeLanguage;feedback.textContent=button.disabled?'':t('Idioma salvo. Aplique agora ou na próxima abertura.');};
 button.onclick=()=>{if(!requestLanguageReload())feedback.textContent=t('Salve os arquivos alterados antes de aplicar o idioma.');};
 parent.append(section);
}
