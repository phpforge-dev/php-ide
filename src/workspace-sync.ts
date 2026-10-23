import { t as tr, msg } from './i18n';
import type { IdeApi } from '../shared/contracts';
import { createFileSync, type SyncedBuffer } from './file-sync-core';

type Editor = { addAction(action: { id: string; label: string; run(): void }): unknown };
/** Liga o watcher do projeto (`ide-workspace-file-changed`) aos buffers abertos. */
export function mountWorkspaceSync(api: IdeApi, buffers: Map<string, SyncedBuffer>, hooks: { tabs(): void; status(text: string): void; editor: Editor; active(): string | undefined }) {
  const sync = createFileSync(path => api.read(path), buffers, event => {
    hooks.tabs();
    hooks.status(event.kind === 'reloaded' ? msg`${event.path} recarregado: alterado fora da IDE.`
      : event.kind === 'deleted' ? msg`${event.path} foi removido ou renomeado no disco; o buffer aberto não será salvo.`
      : msg`${event.path} mudou no disco e tem edições não salvas. Salvar será recusado; use "Recarregar arquivo do disco" para descartar suas edições.`);
  });
  window.addEventListener('ide-workspace-file-changed', event => sync.changed(String((event as CustomEvent<{ path: string }>).detail.path)));
  // Saída explícita do conflito: o buffer editado não pode ser salvo nem fechado enquanto difere do disco.
  hooks.editor.addAction({ id: 'php-ide.reloadFromDisk', label: tr('Recarregar arquivo do disco (descarta edições)'), run: () => {
    const path = hooks.active(); if (!path) return;
    sync.reload(path).then(() => { hooks.tabs(); hooks.status(msg`${path} recarregado do disco.`); }, error => hooks.status(String(error)));
  } });
  return sync;
}
