// Roteiro de janela real para o recorte 19 (Rename Symbol, prévia, desfazer, Extract Method,
// inspeções e quick fix). Usa arquivos próprios criados no fixture temporário do smoke nativo.
import * as monaco from 'monaco-editor';
type Check = (name: string, work: () => Promise<void>) => Promise<void>;
type Tools = { check: Check; assert(value: unknown, message: string): void; wait(test: () => boolean, ms?: number, label?: string): Promise<void> };
export async function refactorSmoke({ check, assert, wait }: Tools) {
 const api = window.ide; const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
 const ed = () => monaco.editor.getEditors().find(e => e.getDomNode()?.closest('#editor'))!;
 const status = () => document.getElementById('status')?.textContent ?? '';
 const root = (await api.workspace()).root.replace(/[\\/]$/, '');
 const open = async (path: string) => { await (ed() as any)._codeEditorService.openCodeEditor({ resource: monaco.Uri.file(`${root}/${path}`) }, ed()); await wait(() => ed().getModel()?.uri.path.endsWith('/' + path) ?? false, 10000, 'arquivo não abriu: ' + path); };
 const at = (needle: string, delta = 1) => { const m = ed().getModel()!; const p = m.getPositionAt(m.getValue().indexOf(needle) + delta); ed().setPosition(p); ed().focus(); };
 const dialog = async () => { await wait(() => !!document.querySelector('.refactor-dialog'), 30000, 'diálogo de refatoração não abriu: ' + status()); return document.querySelector<HTMLDialogElement>('.refactor-dialog')!; };
 const fill = (d: HTMLElement, value: string) => { const input = d.querySelector<HTMLInputElement>('input:not([type=checkbox])')!; input.value = value; input.dispatchEvent(new Event('input')); };
 const press = (d: HTMLElement, value: string) => d.querySelector<HTMLButtonElement>(`footer button[value=${value}]`)!.click();
 const invoice = `<?php\n\nnamespace Fixture\\Refactor;\n\nclass Invoice\n{\n    public function total(int $qty): int\n    {\n        $price = 3;\n        $sum = $price * $qty;\n        return $sum;\n    }\n}\n`;
 const billing = `<?php\n\nnamespace Fixture;\n\nuse Fixture\\Refactor\\Invoice;\n\n$invoice = new Invoice();\necho $invoice->total(2);\n`;
 const other = `<?php\n\nnamespace Elsewhere;\n\nclass Invoice {}\n$x = new Invoice();\n`;
 await check('Refatoração: Rename de classe com prévia exata, cancelar, arquivo renomeado e desfazer', async () => {
  await api.fileCreate('Invoice.php', 'file', invoice); await api.fileCreate('billing.php', 'file', billing); await api.fileCreate('elsewhere.php', 'file', other);
  await open('billing.php'); at('new Invoice', 5);
  ed().getAction('php-ide.renameSymbol')!.run(); let d = await dialog(); fill(d, 'Bill2'); press(d, 'cancel');
  await sleep(200); assert((await api.read('billing.php')).text === billing && (await api.read('Invoice.php')).text === invoice, 'cancelar alterou arquivos');
  at('new Invoice', 5); ed().getAction('php-ide.renameSymbol')!.run(); d = await dialog(); fill(d, 'Bill2'); press(d, 'preview');
  await wait(() => !!document.querySelector('.refactor-preview'), 20000, 'prévia não abriu');
  const files = [...document.querySelectorAll('.refactor-file > label')].map(l => l.textContent!.trim());
  assert(files.some(f => f.startsWith('Invoice.php')) && files.some(f => f.startsWith('billing.php')) && !files.some(f => f.startsWith('elsewhere.php')), 'prévia com arquivos errados: ' + files.join(' | '));
  assert(document.querySelectorAll('.refactor-occurrence').length === 3, 'ocorrências na prévia: ' + document.querySelectorAll('.refactor-occurrence').length);
  document.querySelector<HTMLButtonElement>('.refactor-preview .apply')!.click();
  await wait(() => !!document.querySelector('.refactor-toast'), 20000, 'refatoração não concluiu: ' + status());
  await wait(() => ed().getModel()?.getValue().includes('new Bill2()') ?? false, 10000, 'buffer não atualizado');
  const renamed = await api.read('Bill2.php'); assert(renamed.text.includes('class Bill2'), 'classe/arquivo não renomeados');
  assert((await api.read('billing.php')).text.includes('use Fixture\\Refactor\\Bill2;'), 'import não atualizado no disco');
  assert((await api.read('elsewhere.php')).text === other, 'homônimo alterado');
  assert(!document.querySelector('#tabs .file-tab button')?.textContent?.includes('•'), 'buffer ficou sujo após gravar');
  document.querySelector<HTMLButtonElement>('.refactor-toast button')!.click();
  await wait(() => status().startsWith('Desfeito'), 20000, 'desfazer falhou: ' + status());
  assert((await api.read('Invoice.php')).text === invoice && (await api.read('billing.php')).text === billing, 'desfazer não restaurou o conteúdo');
  await wait(() => ed().getModel()?.getValue() === billing, 10000, 'buffer não restaurado');
 });
 await check('Refatoração: Extract Method, Ctrl+Z, inspeção de tipo e quick fix', async () => {
  const errors: string[] = []; const onError = (e: ErrorEvent) => errors.push(String(e.message)); window.addEventListener('error', onError);
  await open('Invoice.php'); const m = ed().getModel()!; const text = m.getValue();
  const s = m.getPositionAt(text.indexOf('$sum = ')); const e = m.getPositionAt(text.indexOf('$qty;') + 5);
  ed().setSelection(new monaco.Selection(s.lineNumber, s.column, e.lineNumber, e.column)); ed().focus();
  ed().getAction('php-ide.extractMethod')!.run(); const d = await dialog();
  await wait(() => d.querySelector('.refactor-live')!.textContent!.includes('$price'), 5000, 'assinatura não calculada');
  fill(d, 'multiply'); press(d, 'ok');
  await wait(() => m.getValue().includes('$sum = $this->multiply($price, $qty);') && m.getValue().includes('private function multiply($price, int $qty)'), 10000, 'Extract Method não aplicado: ' + status());
  m.undo(); await wait(() => m.getValue() === invoice, 5000, 'Ctrl+Z não restaurou');
  m.applyEdits([{ range: m.getFullModelRange(), text: invoice.replace('return $sum;', "return 'x';") }]);
  await wait(() => monaco.editor.getModelMarkers({ resource: m.uri, owner: 'php-inspections' }).some(k => k.code === 'PhpIncompatibleReturnTypeInspection'), 15000, 'inspeção de tipo ausente');
  const x = m.getValue().indexOf("'x'"); const p = m.getPositionAt(x + 1);
  const { pluginService } = await import('./plugin-services');const codeActions=pluginService('phpIntelligence')?.codeActions;if(!codeActions)throw Error('PHP intelligence plugin is inactive');
  const actions:monaco.languages.CodeAction[] = await codeActions(m, new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column));
  const titles = actions.map(a => a.title);
  assert(titles.includes('Suprimir PhpIncompatibleReturnTypeInspection nesta instrução'), 'supressão ausente: ' + titles.join(' | '));
  const fix = actions.find(a => a.title === 'Alterar tipo de retorno para string'); assert(fix?.edit, 'quick fix ausente: ' + titles.join(' | '));
  m.pushEditOperations([], fix!.edit!.edits.map(e => ({ range: (e as monaco.languages.IWorkspaceTextEdit).textEdit.range, text: (e as monaco.languages.IWorkspaceTextEdit).textEdit.text })), () => null);
  await wait(() => m.getValue().includes('function total(int $qty): string'), 10000, 'quick fix não aplicado');
  await wait(() => !monaco.editor.getModelMarkers({ resource: m.uri, owner: 'php-inspections' }).some(k => k.code === 'PhpIncompatibleReturnTypeInspection'), 15000, 'marcador permaneceu');
  m.setValue(invoice); window.removeEventListener('error', onError);
  const disk = (await api.read('Invoice.php')).text; await wait(() => ![...document.querySelectorAll<HTMLElement>('#tabs button')].some(b => b.title === 'Invoice.php' && b.textContent!.endsWith(' •')), 3000, 'Invoice.php ficou suja; disco: ' + JSON.stringify(disk));
  assert(!errors.length, 'erros no renderer: ' + errors.join(' | '));
 });
}
