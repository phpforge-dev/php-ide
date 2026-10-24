import * as monaco from 'monaco-editor';
import {formatEdit} from '../shared/formatting/edits';
import type {IdeApi} from '../shared/contracts';
import type {FormatRequest,FormatResult} from '../shared/language/plugins/api';
import {keymap} from './keymap';
import {t as tr} from './i18n';

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
   result=await api.formatDocument(request);
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
