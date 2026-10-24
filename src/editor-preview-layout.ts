import type * as monaco from 'monaco-editor';
type Mode = 'editor' | 'split' | 'preview';
type Owner = { active(): boolean; mode(): Mode; preview: HTMLElement; toolbar: HTMLElement };
const layouts = new WeakMap<monaco.editor.IStandaloneCodeEditor, ReturnType<typeof create>>();
/** One split container, shared by document previews without competing over editor visibility. */
function create(editor: monaco.editor.IStandaloneCodeEditor) {
 const host=document.getElementById('editor')!,container=document.createElement('div');container.className='editor-split';host.replaceWith(container);container.append(host);
 const owners:Owner[]=[];
 const update=()=>{const current=owners.find(o=>o.active());const mode=current?.mode()??'editor';container.dataset.mode=mode;host.hidden=mode==='preview';for(const owner of owners){owner.toolbar.hidden=owner!==current;owner.preview.hidden=owner!==current||mode==='editor';}editor.layout();};
 return {host,container,update,register(owner:Owner){owners.push(owner);container.append(owner.preview);update();return()=>{const index=owners.indexOf(owner);if(index>=0)owners.splice(index,1);owner.preview.remove();owner.toolbar.remove();update();};}};
}
export function editorPreviewLayout(editor:monaco.editor.IStandaloneCodeEditor){let layout=layouts.get(editor);if(!layout){layout=create(editor);layouts.set(editor,layout);}return layout;}
