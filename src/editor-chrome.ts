import * as monaco from 'monaco-editor';
import { t as tr } from './i18n';
import { editorColors } from './editor-theme';
import { resolvedTheme } from './theme';
import './editor-chrome.css';
// PhpStorm editor chrome on top of Monaco (catalog UI-EDITOR-CHROME-001). Observed on references 05 (dark) and
// 40 (light): line numbers at the gutter's left edge, gutter icons after them, folding and the VCS bar against a
// separator line, right margin at column 120, thin error-stripe marks and the inspection widget in the top-right
// corner. Public help documents the widget and the stripe; the drawing (icons, sizes) is our own.

/** Options that replace Monaco/VS Code defaults with the PhpStorm editor layout. */
export const phpStormEditorOptions: monaco.editor.IEditorOptions = {
 glyphMargin: true, // PhpStorm always reserves the icon area, so the gutter does not jump when icons appear.
 lineNumbersMinChars: 3, lineDecorationsWidth: 14,
 rulers: [120], // "Hard wrap at" default of the public Code Style settings.
 renderLineHighlight: 'all', minimap: { enabled: false },
 overviewRulerLanes: 0, hideCursorInOverviewRuler: true, overviewRulerBorder: false, // replaced by the error stripe below
 scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12, verticalSliderSize: 8, horizontalSliderSize: 8, useShadows: false },
 fixedOverflowWidgets: true,
};

/** Monaco measures the character width once, when the editor is created. JetBrains Mono uses font-display:swap
 *  and nothing requests it earlier, so that first measurement uses the fallback (SF Mono/Menlo, wider) while the
 *  text is drawn in JetBrains Mono: the cursor and word highlights then drift left along the line. Load the faces
 *  and remeasure whenever fonts finish loading. */
function remeasureWhenFontsLoad() {
 const faces = ['13px "JetBrains Mono"', 'italic 13px "JetBrains Mono"', 'bold 13px "JetBrains Mono"', 'italic bold 13px "JetBrains Mono"'];
 void Promise.allSettled(faces.map(face => document.fonts.load(face))).then(() => monaco.editor.remeasureFonts());
 document.fonts.addEventListener('loadingdone', () => monaco.editor.remeasureFonts());
}

export function mountEditorChrome(editor: monaco.editor.IStandaloneCodeEditor) {
 remeasureWhenFontsLoad();
 editor.updateOptions(phpStormEditorOptions);
 // Monaco rebuilds its own node on every setModel and rewrites its className, so the marker class, the gutter
 // variables and the listeners live on the container; the stripe is moved into the current node when painting.
 const host = editor.getContainerDomNode(); host.classList.add('phpstorm-editor');
 const disposables: monaco.IDisposable[] = [];

 // Gutter order. Monaco lays out [icons][numbers][folding]; PhpStorm shows [numbers][icons][folding]. The CSS
 // swaps the first two columns and the pointer events are mapped back so Monaco's hit test still sees the
 // column the user clicked (icon clicks stay GUTTER_GLYPH_MARGIN, number clicks select lines).
 let glyph = 0, numbers = 0;
 const layout = () => {
  const info = editor.getLayoutInfo(); glyph = info.glyphMarginWidth; numbers = info.lineNumbersWidth;
  host.style.setProperty('--ij-gutter-glyph', glyph + 'px'); host.style.setProperty('--ij-gutter-numbers', numbers + 'px');
  host.style.setProperty('--ij-gutter-decorations', info.decorationsWidth + 'px');
 };
 layout(); disposables.push(editor.onDidLayoutChange(layout));
 const remapped = new WeakSet<Event>();
 const remap = (event: MouseEvent) => {
  if (remapped.has(event) || !glyph || !(event.target instanceof Element) || !event.target.closest('.margin')) return;
  const x = event.clientX - (editor.getDomNode() ?? host).getBoundingClientRect().left;
  const delta = x < numbers ? glyph : x < numbers + glyph ? -numbers : 0;
  if (!delta) return;
  const init: PointerEventInit = { bubbles: event.bubbles, cancelable: event.cancelable, composed: event.composed, view: event.view, detail: event.detail,
   clientX: event.clientX + delta, clientY: event.clientY, screenX: event.screenX + delta, screenY: event.screenY, button: event.button, buttons: event.buttons,
   ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, relatedTarget: event.relatedTarget };
  const copy = event instanceof PointerEvent ? new PointerEvent(event.type, { ...init, pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
   width: event.width, height: event.height, pressure: event.pressure }) : new MouseEvent(event.type, init);
  remapped.add(copy); event.stopImmediatePropagation();
  event.target.dispatchEvent(copy);
  if (copy.defaultPrevented) event.preventDefault();
 };
 const types = ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'contextmenu', 'click', 'dblclick'] as const;
 for (const type of types) host.addEventListener(type, remap, true);
 disposables.push({ dispose: () => types.forEach(type => host.removeEventListener(type, remap, true)) });

 // Error stripe: thin dashes per decoration with an overview color (markers, VCS, search, identifier under caret).
 const stripe = document.createElement('div'); stripe.className = 'error-stripe'; stripe.setAttribute('aria-hidden', 'true');
 const color = (value: string | monaco.editor.ThemeColor | undefined) => !value ? undefined : typeof value === 'string' ? value : editorColors(resolvedTheme() === 'light')[value.id];
 let frame = 0;
 const paint = () => { frame = 0;
  const model = editor.getModel(); const info = editor.getLayoutInfo(); const node = editor.getDomNode();
  if (node && stripe.parentElement !== node) node.append(stripe);
  stripe.style.top = '0'; stripe.style.height = info.height - info.horizontalScrollbarHeight + 'px';
  if (!model) { stripe.replaceChildren(); return; }
  const height = stripe.clientHeight; const scale = height / Math.max(editor.getContentHeight(), height);
  const marks: HTMLElement[] = [];const seen = new Set<string>();
  for (const decoration of model.getOverviewRulerDecorations()) {
   const ruler = decoration.options.overviewRuler; const fill = color(ruler?.color); if (!ruler || !fill) continue;
   const top = Math.round(editor.getTopForLineNumber(decoration.range.startLineNumber) * scale);
   const lane = ruler.position === monaco.editor.OverviewRulerLane.Left ? 'vcs' : 'mark'; const key = lane + top + fill; if (seen.has(key)) continue; seen.add(key);
   const mark = document.createElement('i'); mark.className = 'error-stripe-' + lane; mark.style.top = Math.min(top, height - 3) + 'px'; mark.style.background = fill;
   mark.dataset.line = String(decoration.range.startLineNumber); marks.push(mark);
  }
  stripe.replaceChildren(...marks);
 };
 const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
 stripe.addEventListener('mousedown', event => { const line = Number((event.target as HTMLElement).dataset.line); if (!line) return;
  event.preventDefault(); editor.setPosition({ lineNumber: line, column: 1 }); editor.revealLineInCenterIfOutsideViewport(line); editor.focus(); });
 schedule(); disposables.push(editor.onDidChangeModelDecorations(schedule), editor.onDidChangeModel(schedule), editor.onDidLayoutChange(schedule), editor.onDidContentSizeChange(schedule));
 const themeObserver = new MutationObserver(schedule); themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
 disposables.push({ dispose: () => themeObserver.disconnect() });

 // Inspection widget: severity counters (or a green check) and previous/next problem arrows.
 const widget = document.createElement('div'); widget.className = 'inspection-widget'; widget.setAttribute('role', 'status');
 const severities = [
  { severity: monaco.MarkerSeverity.Error, kind: 'error', one: '{0} erro', many: '{0} erros' },
  { severity: monaco.MarkerSeverity.Warning, kind: 'warning', one: '{0} aviso', many: '{0} avisos' },
  { severity: monaco.MarkerSeverity.Info, kind: 'weak', one: '{0} aviso fraco', many: '{0} avisos fracos' },
 ];
 const problems = () => { const model = editor.getModel(); if (!model) return [];
  return monaco.editor.getModelMarkers({ resource: model.uri }).filter(marker => marker.severity >= monaco.MarkerSeverity.Info)
   .sort((a, b) => a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn); };
 const go = (direction: 1 | -1) => {
  const list = problems(); if (!list.length) return;
  const at = editor.getPosition() ?? new monaco.Position(1, 1);
  const after = (m: monaco.editor.IMarker) => m.startLineNumber > at.lineNumber || (m.startLineNumber === at.lineNumber && m.startColumn > at.column);
  const before = (m: monaco.editor.IMarker) => m.startLineNumber < at.lineNumber || (m.startLineNumber === at.lineNumber && m.startColumn < at.column);
  const target = direction > 0 ? list.find(after) ?? list[0] : [...list].reverse().find(before) ?? list[list.length - 1];
  editor.setPosition({ lineNumber: target.startLineNumber, column: target.startColumn }); editor.revealPositionInCenterIfOutsideViewport(editor.getPosition()!);
  editor.focus(); editor.trigger('inspection-widget', 'editor.action.showHover', {});
 };
 const render = () => {
  const list = problems(); const counts = severities.map(s => ({ ...s, count: list.filter(m => m.severity === s.severity).length })).filter(s => s.count);
  widget.replaceChildren();
  const summary = document.createElement('button'); summary.type = 'button'; summary.className = 'inspection-summary';
  if (!counts.length) {
   summary.innerHTML = '<svg viewBox="0 0 16 16" class="inspection-ok"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
   widget.setAttribute('aria-label', tr('Nenhum problema encontrado')); summary.title = tr('Nenhum problema encontrado'); summary.disabled = true;
   widget.append(summary); return;
  }
  const labels = counts.map(s => tr(s.count === 1 ? s.one : s.many, s.count));
  widget.setAttribute('aria-label', labels.join(', ')); summary.title = labels.join(', ') + ' · ' + tr('Próximo problema') + ' (F2)';
  for (const s of counts) {
   const item = document.createElement('span'); item.className = 'inspection-count inspection-' + s.kind;
   item.innerHTML = s.kind === 'error'
    ? '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="M8 4.5v4.5M8 11.2v.3" stroke="var(--ij-island)" stroke-width="1.6" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 16 16"><path d="M8 1.8l6.6 11.7H1.4z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><path d="M8 6v3.6M8 11.6v.2" stroke="var(--ij-island)" stroke-width="1.5" stroke-linecap="round"/></svg>';
   item.append(String(s.count)); summary.append(item);
  }
  summary.onclick = () => go(1);
  const arrow = (action: 'previous' | 'next', label: string, path: string) => { const button = document.createElement('button'); button.type = 'button';
   button.className = 'inspection-arrow'; button.dataset.action = action; button.title = label; button.setAttribute('aria-label', label);
   button.innerHTML = `<svg viewBox="0 0 16 16"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
   button.onclick = () => go(action === 'next' ? 1 : -1); return button; };
  widget.append(summary, arrow('previous', tr('Problema anterior') + ' (Shift+F2)', 'M4.5 10l3.5-3.5 3.5 3.5'), arrow('next', tr('Próximo problema') + ' (F2)', 'M4.5 6.5l3.5 3.5 3.5-3.5'));
 };
 const overlay: monaco.editor.IOverlayWidget = { getId: () => 'php-ide.inspection-widget', getDomNode: () => widget, getPosition: () => ({ preference: monaco.editor.OverlayWidgetPositionPreference.TOP_RIGHT_CORNER }) };
 editor.addOverlayWidget(overlay); render();
 disposables.push(monaco.editor.onDidChangeMarkers(uris => { const uri = editor.getModel()?.uri.toString(); if (uris.some(u => u.toString() === uri)) render(); }),
  editor.onDidChangeModel(render), { dispose: () => editor.removeOverlayWidget(overlay) });

 return { dispose: () => { disposables.forEach(d => d.dispose()); stripe.remove(); cancelAnimationFrame(frame); } };
}
