import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';

export function installEditorWorkers(){
 (globalThis as any).MonacoEnvironment={getWorker:(_module:string,label:string)=>{
  if(label==='typescript'||label==='javascript')return new TypeScriptWorker();
  if(label==='json')return new JsonWorker();
  if(['html','handlebars','razor'].includes(label))return new HtmlWorker();
  if(['css','scss','less'].includes(label))return new CssWorker();
  return new EditorWorker();
 }};
}
