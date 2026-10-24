import * as monaco from 'monaco-editor';
import PhpWorker from './php-format.worker.ts?worker';
import {formatEdit} from '../shared/formatting/edits';
import {readStyle,type Style} from '../shared/formatting/config';
import type {IdeApi} from '../shared/contracts';
import type {FormatRequest,FormatResult} from '../shared/language/plugins/api';
import {keymap} from './keymap';
import {t as tr} from './i18n';

function php(request:FormatRequest,style:Style):Promise<FormatResult>{
 return new Promise((resolve,reject)=>{
  const worker=new PhpWorker();const timer=setTimeout(()=>{worker.terminate();reject(Error(tr('PHP: formatação excedeu o limite de tempo.')));},4000);
  const stop=()=>{clearTimeout(timer);worker.terminate();};
  worker.onmessage=event=>{stop();if(event.data.error)reject(Error(event.data.error));else resolve({text:event.data.text});};
  worker.onerror=event=>{event.preventDefault();stop();reject(Error(event.message));};worker.postMessage({...request,style});
 });
}
export function mountFormatting(editor:monaco.editor.IStandaloneCodeEditor,api:IdeApi,host:{path():string|undefined;status(text:string):void}){
 let busy=false;
 const run=async(whole=false)=>{
  const model=editor.getModel(),path=host.path();if(!model||!path||busy||editor.getOption(monaco.editor.EditorOption.readOnly))return;
  const version=model.getVersionId(),text=model.getValue(),selection=editor.getSelection();const options=model.getOptions();
  const request:FormatRequest={path,text,language:model.getLanguageId(),options:{tabSize:options.tabSize,insertSpaces:options.insertSpaces},
   ...(!whole&&selection&&!selection.isEmpty()?{range:{start:model.getOffsetAt(selection.getStartPosition()),end:model.getOffsetAt(selection.getEndPosition())}}:{})};
  busy=true;host.status(tr('Formatando código…'));
  try{
   let result:FormatResult|null;
   if(request.language==='php'&&!path.endsWith('.blade.php')){
    const style=await readStyle(path,async file=>{try{return(await api.read(file)).text;}catch{return null;}},request.options,text);
    result=await php(request,style);
   }else result=await api.formatDocument(request);
   if(model.isDisposed()||editor.getModel()!==model||model.getVersionId()!==version||host.path()!==path){host.status(tr('Formatação descartada: o documento foi alterado.'));return;}
   if(!result){host.status(tr('Nenhum formatador ativo para este arquivo. Instale ou ative um plugin em Aparência → Plugins.'));return;}
   const edit=formatEdit(text,result.text);
   if(!edit){host.status(tr('Código já formatado.'));return;}
   const a=model.getPositionAt(edit.start),b=model.getPositionAt(edit.end);
   editor.pushUndoStop();editor.executeEdits('php-ide.format',[{range:new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column),text:edit.text,forceMoveMarkers:true}]);editor.pushUndoStop();
   host.status(tr('Código formatado.'));editor.focus();
  }catch(error){host.status(tr('Falha ao formatar: {0}',String(error)));}finally{busy=false;}
 };
 keymap.registerAction({id:'code.reformat',label:'Reformatar código',category:'Código',aliases:'format formatter prettier php',defaults:{mac:'Meta+Alt+L',other:'Ctrl+Alt+L'},enabled:()=>!!host.path(),run:()=>run()});
 // Context menu and command palette entry; keyboard bindings are managed centrally by Keymap.
 editor.addAction({id:'php-ide.reformat',label:tr('Reformatar código'),contextMenuGroupId:'1_modification',contextMenuOrder:1.5,run:()=>run()});
 editor.addAction({id:'php-ide.reformatFile',label:tr('Reformatar arquivo inteiro'),run:()=>run(true)});
 return {run};
}
