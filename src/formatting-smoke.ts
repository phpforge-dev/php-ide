import * as monaco from 'monaco-editor';
import {t as tr} from './i18n';
import {invoke} from '@tauri-apps/api/core';

/** Offline native integration: the package is a pinned test dependency, installed through real IPC. */
export async function formattingSmoke(info:any){
 const raw=(method:string,args:unknown[]=[])=>invoke<any>('ide',{method,args});
 const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
 const wait=async(test:()=>boolean,label:string)=>{const end=Date.now()+30000;while(!test()){if(Date.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,40));}};
 const click=(root:ParentNode,label:string)=>{const button=[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===tr(label));assert(button,'Botão ausente: '+label);button!.click();};
 await raw('pluginInstall',[info.docker.formatSource,'folder']);
 document.getElementById('plugins')!.click();
 const dialog=document.getElementById('plugins-dialog') as HTMLDialogElement;
 click(dialog,'Recarregar');
 await wait(()=>!!document.querySelector('.plugin-consent'),'Consentimento Prettier ausente');
 const consent=document.querySelector('.plugin-consent')!;
 assert(consent.textContent?.includes('Prettier'),'Consentimento incorreto');click(consent,'Ativar plugin');
 await wait(()=>!document.querySelector('.plugin-consent'),'Consentimento não fechou');
 const card=()=>document.querySelector('[data-installed-plugin="phpforge.prettier"]');
 await wait(()=>!!card()?.querySelector('.plugin-on')||!!card()?.querySelector('.plugin-error'),'Prettier não iniciou');
 assert(card()?.querySelector('.plugin-on')&&card()?.textContent?.includes('format'),'Prettier indisponível: '+card()?.textContent);
 dialog.close();
 const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
 const open=async(path:string)=>{document.querySelector<HTMLButtonElement>(`#tree button[aria-label="${path}"]`)!.click();await wait(()=>ed.getModel()?.uri.path.endsWith('/'+path)===true,'Arquivo não abriu: '+path);return ed.getModel()!;};
 const php=await open('format.php'),before=php.getValue();
 await ed.getAction('php-ide.reformat')!.run();assert(php.getValue().includes('class User\n{'),'PHP não formatou: '+document.getElementById('status')!.textContent);
 ed.trigger('format-test','undo',{});assert(php.getValue()===before,'Undo PHP não restaurou o buffer');
 php.setValue('<?php\n$a=1;\n$b=2;\n');ed.setSelection(new monaco.Range(3,1,4,1));await ed.getAction('php-ide.reformat')!.run();assert(php.getValue()==='<?php\n$a=1;\n$b = 2;\n','PHP alterou texto fora da seleção');
 php.setValue('<?php function {');ed.setPosition({lineNumber:1,column:1});await ed.getAction('php-ide.reformat')!.run();assert(php.getValue()==='<?php function {','PHP inválido foi alterado');assert(document.getElementById('status')!.textContent?.includes(tr('Falha ao formatar: {0}','').split(':')[0]),'Erro de sintaxe sem feedback');php.setValue(before);
 const js=await open('format.js');ed.setPosition({lineNumber:1,column:1});await ed.getAction('php-ide.reformat')!.run();
 assert(js.getValue()==="const user = { name: 'Ada' }\n",'Prettier não respeitou .prettierrc: '+js.getValue()+' | '+document.getElementById('status')!.textContent);
 ed.trigger('format-test','undo',{});assert(js.getValue()==='const user={name:"Ada"}','Undo Prettier falhou');
}
