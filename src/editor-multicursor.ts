import * as monaco from 'monaco-editor';
import { t } from './i18n';

export function mountMulticursor(editor:monaco.editor.IStandaloneCodeEditor,changed:()=>void){
 editor.updateOptions({multiCursorModifier:'alt',multiCursorMergeOverlapping:true,multiCursorPaste:'spread'});
 const mac=/Mac|iPhone|iPad/.test(navigator.platform);
 const next=mac?monaco.KeyMod.WinCtrl|monaco.KeyCode.KeyG:monaco.KeyMod.Alt|monaco.KeyCode.KeyJ;
 const all=mac?monaco.KeyMod.WinCtrl|monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyG:monaco.KeyMod.CtrlCmd|monaco.KeyMod.Alt|monaco.KeyMod.Shift|monaco.KeyCode.KeyJ;
 const actions:[string,string,number[],()=>void][]=[
  ['nextOccurrence','Adicionar próxima ocorrência',[next],()=>editor.trigger('multicursor-menu','editor.action.addSelectionToNextFindMatch',{})],
  ['allOccurrences','Selecionar todas as ocorrências',[all],()=>editor.trigger('multicursor-menu','editor.action.selectHighlights',{})],
  ['removeLastCursor','Remover último cursor',[next|monaco.KeyMod.Shift],()=>{const selections=editor.getSelections();if(selections&&selections.length>1)editor.setSelections(selections.slice(0,-1));}],
  ['cursorAbove','Adicionar cursor acima',[monaco.KeyMod.CtrlCmd|monaco.KeyMod.Alt|monaco.KeyCode.UpArrow],()=>editor.trigger('multicursor-menu','editor.action.insertCursorAbove',{})],
  ['cursorBelow','Adicionar cursor abaixo',[monaco.KeyMod.CtrlCmd|monaco.KeyMod.Alt|monaco.KeyCode.DownArrow],()=>editor.trigger('multicursor-menu','editor.action.insertCursorBelow',{})],
  ['selectedLines','Adicionar cursores às linhas selecionadas',[monaco.KeyMod.Shift|monaco.KeyMod.Alt|monaco.KeyCode.KeyI],()=>editor.trigger('multicursor-menu','editor.action.insertCursorAtEndOfEachLineSelected',{})],
  ['columnSelection','Alternar seleção em coluna',[],()=>editor.updateOptions({columnSelection:!editor.getOption(monaco.editor.EditorOption.columnSelection)})],
 ];
 actions.forEach(([id,label,keybindings,run],index)=>editor.addAction({id:'php-ide.multicursor.'+id,label:t(label),keybindings,keybindingContext:'editorTextFocus',contextMenuGroupId:'2_multicursor',contextMenuOrder:index,run:()=>{run();editor.focus();changed();}}));
 editor.onDidChangeCursorSelection(changed);
}
