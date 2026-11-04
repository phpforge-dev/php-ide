/**
 * Arquivos arrastados do sistema operacional. A janela usa o drag-and-drop HTML5 do WebView
 * (`dragDropEnabled: false` em tauri.conf.json) para que áreas da interface — como o chat do agente —
 * recebam os arquivos. Fora dessas áreas (marcadas com `data-file-drop`) o drop é recusado: sem isso o
 * WebView abriria o arquivo no lugar da IDE, e o Monaco colaria o caminho no editor.
 */
export function guardFileDrops(target: Window = window) {
 const files = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
 const accepted = (event: DragEvent) => event.target instanceof Element && !!event.target.closest('[data-file-drop]');
 const over = (event: DragEvent) => {
  if (!files(event) || accepted(event)) return;
  event.preventDefault(); event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
 };
 const drop = (event: DragEvent) => { if (files(event) && !accepted(event)) { event.preventDefault(); event.stopPropagation(); } };
 // Captura: decide antes do Monaco e de outros ouvintes; nas áreas aceitas o próprio dono trata o drop.
 target.addEventListener('dragover', over, true);
 target.addEventListener('drop', drop, true);
 // Rede de segurança: nenhum drop de arquivo não tratado navega a janela.
 const fallback = (event: DragEvent) => { if (files(event)) event.preventDefault(); };
 target.addEventListener('drop', fallback);
 return () => { target.removeEventListener('dragover', over, true); target.removeEventListener('drop', drop, true); target.removeEventListener('drop', fallback); };
}
