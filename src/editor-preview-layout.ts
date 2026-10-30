import type * as monaco from 'monaco-editor';
type Mode = 'editor' | 'split' | 'preview';
type Owner = { active(): boolean; mode(): Mode; preview: HTMLElement; toolbar: HTMLElement };
const layouts = new WeakMap<monaco.editor.IStandaloneCodeEditor, ReturnType<typeof create>>();
/** One split container, shared by document previews without competing over editor visibility.
 * It wraps `#editor` only while a preview is registered: once the last owner leaves, the shell returns to
 * its original structure, so plugins re-activated after a reload see the same DOM as on first start. */
function create(editor: monaco.editor.IStandaloneCodeEditor) {
 const host=document.getElementById('editor')!,container=document.createElement('div');container.className='editor-split';
 const wrap=()=>{if(host.parentElement!==container){host.replaceWith(container);container.prepend(host);}};
 const unwrap=()=>{if(host.parentElement===container){container.replaceWith(host);host.hidden=false;editor.layout();}};
 const owners:Owner[]=[];
 const update=()=>{const current=owners.find(o=>o.active());const mode=current?.mode()??'editor';container.dataset.mode=mode;host.hidden=mode==='preview';for(const owner of owners){owner.toolbar.hidden=owner!==current;owner.preview.hidden=owner!==current||mode==='editor';}editor.layout();};
 return {host,container,update,register(owner:Owner){wrap();owners.push(owner);container.append(owner.preview);update();return()=>{const index=owners.indexOf(owner);if(index>=0)owners.splice(index,1);owner.preview.remove();owner.toolbar.remove();if(owners.length)update();else unwrap();};}};
}
export function editorPreviewLayout(editor:monaco.editor.IStandaloneCodeEditor){let layout=layouts.get(editor);if(!layout){layout=create(editor);layouts.set(editor,layout);}return layout;}
