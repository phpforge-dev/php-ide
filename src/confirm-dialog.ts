import { t as tr } from './i18n';

/** In-app confirmation. window.confirm is unreliable in the Tauri WebView (returns false without showing anything). */
export function confirmDialog(message: string, ok: string, cancel = tr('Cancelar')): Promise<boolean> {
 return new Promise(resolve => {
  const d = document.createElement('dialog'); d.className = 'project-dialog confirm-dialog';
  const form = document.createElement('form'); form.method = 'dialog';
  const p = document.createElement('p'); p.textContent = message; p.style.whiteSpace = 'pre-line';
  const footer = document.createElement('footer');
  for (const [value, label, primary] of [['cancel', cancel, false], ['ok', ok, true]] as const) { const b = document.createElement('button'); b.value = value; b.textContent = label; if (primary) b.className = 'primary'; footer.append(b); }
  form.append(p, footer); d.append(form); document.body.append(d);
  d.addEventListener('close', () => { const accepted = d.returnValue === 'ok'; d.remove(); resolve(accepted); });
  d.showModal(); footer.querySelector<HTMLButtonElement>('.primary')?.focus();
 });
}
