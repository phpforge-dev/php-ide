import type { editor } from 'monaco-editor';
// Islands editor colors (recorte 28). Values follow the public schemes in design/reference/islands/
// (IslandSchemeDark.xml over expUI_darkScheme.xml; expUI_lightScheme.xml over Light.xml). PHP-specific
// categories are not in those files (the PHP plugin is proprietary): they were measured on the authorized
// screenshots and are marked "observado" below. Nothing here is copied from a product installation.

type Palette = {
 text:string; keyword:string; string:string; escape:string; number:string; comment:string; docComment:string; docTag:string;
 functionDeclaration:string; functionCall:string; method:string; variable:string; constant:string; metadata:string;
 type:string; tag:string; attribute:string; unused:string;
};
const dark:Palette={
 text:'BCBEC4',keyword:'CF8E6D',string:'6AAB73',escape:'CF8E6D',number:'2AACB8',
 comment:'7A7E85',docComment:'5F826B',docTag:'67A37C',
 functionDeclaration:'56A8F5', // DEFAULT_FUNCTION_DECLARATION
 functionCall:'57AAF7', // observado: chamadas PHP (identity, rand) azuis em C02; valor de DEFAULT_INSTANCE_METHOD
 method:'57AAF7', // DEFAULT_INSTANCE_METHOD; observado em C02 (->label())
 variable:'9876AA', // observado: $user/$value #9377A7 (perfil de cor da captura); hipótese de valor original
 constant:'C77DBB',metadata:'B3AE60',type:'BCBEC4',tag:'D5B778',attribute:'BCBEC4',unused:'6F737A',
};
const light:Palette={
 text:'080808',keyword:'0033B3',string:'067D17',escape:'0037A6',number:'1750EB',
 comment:'8C8C8C',docComment:'8C8C8C',docTag:'8C8C8C',
 functionDeclaration:'00627A',
 functionCall:'080808', // DEFAULT_FUNCTION_CALL vazio herda o identificador (Light.xml); não observado em PHP
 method:'00627A', // observado: declarações de método (label/secret) em 40; o token semântico não separa chamada de declaração
 variable:'660000', // observado: $this #5D0E07 em 42 (perfil de cor); hipótese de valor original
 constant:'871094',metadata:'9E880D',type:'080808',tag:'0033B3',attribute:'174AD4',unused:'8C8C8C',
};

/** Token rules for Monarch (php/html/json/markdown/sql) and for our PHP semantic tokens. */
export function editorRules(isLight: boolean): editor.ITokenThemeRule[] {
 const c=isLight?light:dark;
 return [
  {token:'',foreground:c.text},
  {token:'comment',foreground:c.comment,fontStyle:isLight?'italic':''},
  {token:'comment.doc',foreground:c.docComment,fontStyle:'italic'},
  {token:'string',foreground:c.string},{token:'string.php',foreground:c.string},
  {token:'string.escape',foreground:c.escape},{token:'string.escape.invalid',foreground:c.escape,fontStyle:'underline'},
  {token:'keyword',foreground:c.keyword},{token:'metatag',foreground:c.keyword},{token:'metatag.php',foreground:c.keyword},
  {token:'number',foreground:c.number},
  {token:'constant',foreground:c.constant,fontStyle:'italic'},
  {token:'variable',foreground:c.variable},{token:'variable.predefined',foreground:c.variable},
  {token:'identifier',foreground:c.text},{token:'type',foreground:c.type},{token:'type.identifier',foreground:c.type},
  {token:'delimiter',foreground:c.text},{token:'operator',foreground:c.text},
  {token:'annotation',foreground:c.metadata},{token:'attribute.name',foreground:c.attribute},{token:'attribute.value',foreground:c.string},
  {token:'type.yaml',foreground:c.tag},{token:'tag',foreground:c.tag},{token:'metatag.html',foreground:c.tag},
  // Semantic tokens from php-editor-insights (variable, method, function, type+constructor, keyword=builtin).
  {token:'method',foreground:c.method},
  {token:'function',foreground:c.functionCall},
  {token:'function.declaration',foreground:c.functionDeclaration},
  {token:'type.constructor',foreground:c.type},
  {token:'unused',foreground:c.unused},
  // JSON/Markdown/SQL use the same default attributes.
  {token:'string.key.json',foreground:isLight?'871094':'C77DBB'},{token:'string.value.json',foreground:c.string},
  {token:'keyword.json',foreground:c.keyword},
  {token:'keyword.md',foreground:c.keyword},{token:'strong',fontStyle:'bold'},{token:'emphasis',fontStyle:'italic'},
  {token:'predefined.sql',foreground:c.functionCall},{token:'operator.sql',foreground:c.keyword},
 ];
}

/** Monaco workbench colors for the editor surface, gutter and widgets. */
export function editorColors(isLight:boolean):Record<string,string>{return isLight?{
 'editor.background':'#FFFFFF','editor.foreground':'#080808', // TEXT
 'editorLineNumber.foreground':'#AEB3C2','editorLineNumber.activeForeground':'#767A8A', // LINE_NUMBERS_COLOR / ON_CARET_ROW
 'editor.lineHighlightBackground':'#F5F8FE','editor.lineHighlightBorder':'#00000000', // CARET_ROW_COLOR
 'editor.selectionBackground':'#A6D2FF','editor.inactiveSelectionBackground':'#A6D2FF99', // SELECTION_BACKGROUND
 'editorCursor.foreground':'#000000',
 'editorIndentGuide.background1':'#EBECF0','editorIndentGuide.activeBackground1':'#AEB3C2', // INDENT_GUIDE / SELECTED_INDENT_GUIDE
 'editorRuler.foreground':'#EBECF0', // RIGHT_MARGIN_COLOR
 'editorWhitespace.foreground':'#ADADAD',
 'editorBracketMatch.background':'#93D9D9','editorBracketMatch.border':'#00000000', // MATCHED_BRACE_ATTRIBUTES
 'editor.wordHighlightBackground':'#EDEBFC','editor.wordHighlightStrongBackground':'#FCE8F4', // IDENTIFIER_UNDER_CARET / WRITE_
 'editor.findMatchBackground':'#FCD47E','editor.findMatchHighlightBackground':'#FCD47E99', // TEXT_SEARCH_RESULT
 'editorError.foreground':'#F50000','editorWarning.foreground':'#F2BF57','editorInfo.foreground':'#3871E1', // WRONG_REFERENCES / WARNING stripe
 'editorOverviewRuler.errorForeground':'#F50000','editorOverviewRuler.warningForeground':'#F2BF57','editorOverviewRuler.border':'#00000000',
 'editorGutter.background':'#FFFFFF','editorGutter.addedBackground':'#7FC784','editorGutter.modifiedBackground':'#88ADF7','editorGutter.deletedBackground':'#767A8A', // *_LINES_COLOR
 'editorCodeLens.foreground':'#7A7A7A', // observado: inlays em 40
 'editorInlayHint.foreground':'#5F6269','editorInlayHint.background':'#EBECF0',
 'editorWidget.background':'#FFFFFF','editorWidget.border':'#D1D3D9','editorWidget.foreground':'#000000', // Popup.*
 'editorSuggestWidget.background':'#FFFFFF','editorSuggestWidget.border':'#D1D3D9','editorSuggestWidget.foreground':'#080808',
 'editorSuggestWidget.selectedBackground':'#E9EAEE','editorSuggestWidget.highlightForeground':'#2F5EB9','editorSuggestWidget.focusHighlightForeground':'#2F5EB9', // observado 42 / CompletionPopup.matchForeground
 'editorHoverWidget.background':'#FFFFFF','editorHoverWidget.border':'#D1D3D9', // DOCUMENTATION_COLOR
 'input.background':'#FFFFFF','input.foreground':'#000000','input.border':'#D1D3D9','focusBorder':'#3871E1',
 'list.hoverBackground':'#00000008','list.activeSelectionBackground':'#D0DFFE','list.activeSelectionForeground':'#000000','list.inactiveSelectionBackground':'#E9EAEE',
 'scrollbarSlider.background':'#80808059','scrollbarSlider.hoverBackground':'#8080808C','scrollbarSlider.activeBackground':'#8080808C',
 'scrollbar.shadow':'#00000000','editorStickyScroll.background':'#FFFFFF','diffEditor.insertedTextBackground':'#7FC78433','diffEditor.removedTextBackground':'#E557571F',
}:{
 'editor.background':'#191A1C','editor.foreground':'#BCBEC4',
 'editorLineNumber.foreground':'#4B5059','editorLineNumber.activeForeground':'#A1A3AB',
 'editor.lineHighlightBackground':'#1F2024','editor.lineHighlightBorder':'#00000000',
 'editor.selectionBackground':'#214283','editor.inactiveSelectionBackground':'#21428399', // hipótese: SELECTION_BACKGROUND herdado de Darcula (pai público não incluído)
 'editorCursor.foreground':'#CED0D6',
 'editorIndentGuide.background1':'#323438','editorIndentGuide.activeBackground1':'#4E5157',
 'editorRuler.foreground':'#323438',
 'editorWhitespace.foreground':'#6F737A',
 'editorBracketMatch.background':'#43454A','editorBracketMatch.border':'#00000000',
 'editor.wordHighlightBackground':'#373B39','editor.wordHighlightStrongBackground':'#402F33',
 'editor.findMatchBackground':'#2D543F','editor.findMatchHighlightBackground':'#114957',
 'editorError.foreground':'#FA6675','editorWarning.foreground':'#F2C55C','editorInfo.foreground':'#548AF7',
 'editorOverviewRuler.errorForeground':'#D64D5B','editorOverviewRuler.warningForeground':'#C29E4A','editorOverviewRuler.border':'#00000000',
 'editorGutter.background':'#191A1C','editorGutter.addedBackground':'#549159','editorGutter.modifiedBackground':'#375FAD','editorGutter.deletedBackground':'#868A91',
 'editorCodeLens.foreground':'#727782', // INLAY_TEXT_WITHOUT_BACKGROUND (observado #737781 em C02)
 'editorInlayHint.foreground':'#858A94','editorInlayHint.background':'#393B40', // INLINE_PARAMETER_HINT
 'editorWidget.background':'#26282C','editorWidget.border':'#33353B','editorWidget.foreground':'#D1D3D9',
 'editorSuggestWidget.background':'#26282C','editorSuggestWidget.border':'#33353B','editorSuggestWidget.foreground':'#BCBEC4',
 'editorSuggestWidget.selectedBackground':'#33353B','editorSuggestWidget.highlightForeground':'#538AF9','editorSuggestWidget.focusHighlightForeground':'#538AF9', // observado 13 / CompletionPopup.*
 'editorHoverWidget.background':'#27282B','editorHoverWidget.border':'#33353B', // DOCUMENTATION_COLOR
 'input.background':'#191A1C','input.foreground':'#D1D3D9','input.border':'#40434A','focusBorder':'#3871E1',
 'list.hoverBackground':'#FFFFFF10','list.activeSelectionBackground':'#2A4371','list.activeSelectionForeground':'#D1D3D9','list.inactiveSelectionBackground':'#33353B',
 'scrollbarSlider.background':'#80808059','scrollbarSlider.hoverBackground':'#8080808C','scrollbarSlider.activeBackground':'#8080808C',
 'scrollbar.shadow':'#00000000','editorStickyScroll.background':'#191A1C','diffEditor.insertedTextBackground':'#54915933','diffEditor.removedTextBackground':'#DB5C5C26',
};}

/** Editor typography measured on 05/40: JetBrains Mono 13px on a 22px row. */
export const editorFont={family:'"JetBrains Mono", ui-monospace, Menlo, monospace',size:13,lineHeight:(size:number)=>Math.round(size*22/13),
 // Inlays ("5 usages · Ref") use the UI font, one point smaller (observado 05/40).
 codeLensFamily:'Inter, -apple-system, BlinkMacSystemFont, sans-serif',codeLensSize:12};
