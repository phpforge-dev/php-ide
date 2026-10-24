import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';

export function installEditorWorkers(){
 // Optional language packages own semantic providers; prevent Monaco's permanent TS registration.
 for(const defaults of [monaco.typescript.javascriptDefaults,monaco.typescript.typescriptDefaults]){
  const key=Symbol.for('phpforge.webLanguages.modeConfiguration');(defaults as any)[key]??={...defaults.modeConfiguration};
  defaults.setModeConfiguration(Object.fromEntries(Object.keys(defaults.modeConfiguration).map(name=>[name,false])));
 }
 (globalThis as any).MonacoEnvironment={getWorker:(_module:string,label:string)=>{
  if(label==='json')return new JsonWorker();
  if(['html','handlebars','razor'].includes(label))return new HtmlWorker();
  if(['css','scss','less'].includes(label))return new CssWorker();
  return new EditorWorker();
 }};
}
