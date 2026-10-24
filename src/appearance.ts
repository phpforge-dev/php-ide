import { t as tr, html, mountLanguageSettings } from './i18n';
import { editorColors, resolvedTheme, setThemePreference, themePreference, type ThemePreference } from './theme';
import { editorFont, editorRules } from './editor-theme';
import * as monaco from 'monaco-editor';

type Settings = { theme: ThemePreference; compact: boolean; fontSize: number; left: number; right: number };
const defaults: Settings = { theme: 'system', compact: true, fontSize: editorFont.size, left: 240, right: 320 };
export function mountAppearance(editor: monaco.editor.IStandaloneCodeEditor) {
  let settings = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem('php-ide-appearance') ?? '{}');
    settings = { theme: themePreference(), compact: saved.compact !== false,
      fontSize: Math.min(22, Math.max(11, Number(saved.fontSize) || editorFont.size)), left: Math.min(420, Math.max(180, Number(saved.left) || 240)), right: Math.min(480, Math.max(240, Number(saved.right) || 320)) };
  } catch { /* A corrupt preference should not prevent opening the IDE. */ }
  for(const light of [false,true])monaco.editor.defineTheme(light?'independent-light':'independent-dark',{base:light?'vs':'vs-dark',inherit:true,rules:editorRules(light),colors:editorColors(light)});
  function apply() {
    if(themePreference()!==settings.theme)setThemePreference(settings.theme);
    document.documentElement.dataset.density = settings.compact ? 'compact' : 'comfortable';
    document.documentElement.style.setProperty('--left-panel', settings.left + 'px');
    document.documentElement.style.setProperty('--right-panel', settings.right + 'px');
    monaco.editor.setTheme(resolvedTheme() === 'dark' ? 'independent-dark' : 'independent-light');
    editor.updateOptions({ fontSize: settings.fontSize, lineHeight: editorFont.lineHeight(settings.fontSize) });
    try{localStorage.setItem('php-ide-appearance', JSON.stringify(settings));}catch{/* Optional persistence. */}
  }
  const dialog = document.createElement('dialog'); dialog.id = 'appearance-dialog';
  dialog.setAttribute('aria-label',tr('Aparência'));
  dialog.innerHTML = html`<div class="appearance-heading"><h2>Aparência</h2><button type="button" id="appearance-close" aria-label="Fechar aparência">×</button></div><p>Veja as mudanças no editor enquanto ajusta.</p><p class="appearance-section">Tema</p><label for="appearance-theme">Tema da interface</label><select id="appearance-theme"><option value="system">Seguir o sistema</option><option value="dark">Escuro</option><option value="light">Claro</option></select><div class="theme-options" role="group" aria-label="Escolher tema">${(['dark','light'] as const).map(mode=>`<button type="button" data-theme-option="${mode}" aria-pressed="false"><span class="theme-sample sample-${mode}" aria-hidden="true"><i></i><span><b></b><b></b><b></b></span></span>${mode==='dark'?tr('Escuro'):tr('Claro')}<span class="theme-check" aria-hidden="true">✓</span></button>`).join('')}</div><p id="appearance-effective" role="status"></p><div class="appearance-divider"></div><p class="appearance-section">Opções da interface</p><label class="appearance-density"><span>Interface compacta<small>Mais espaço para código e ferramentas</small></span><input type="checkbox" id="appearance-compact"></label><label for="appearance-font">Tamanho da fonte <output id="appearance-font-value"></output></label><input type="range" id="appearance-font" min="11" max="22"><div class="appearance-footer"><button id="appearance-reset">Restaurar padrão</button><span>Salvo automaticamente</span></div>`;
  const autosaveLabel = document.createElement('label'); autosaveLabel.className = 'appearance-density';
  const autosaveText = document.createElement('span'); autosaveText.textContent = tr('Salvamento automático');
  const autosaveHint = document.createElement('small'); autosaveHint.textContent = tr('Salva arquivos após 800 ms sem digitar. Desativado: use ⌘/Ctrl+S.'); autosaveText.append(autosaveHint);
  const autosave = document.createElement('input'); autosave.type = 'checkbox'; autosave.id = 'settings-autosave';
  try { autosave.checked = localStorage.getItem('php-ide-autosave') !== 'false'; } catch { autosave.checked = true; }
  autosave.onchange = () => { try { localStorage.setItem('php-ide-autosave', String(autosave.checked)); } catch { autosave.checked = !autosave.checked; return; } window.dispatchEvent(new Event('ide-autosave-changed')); };
  autosaveLabel.append(autosaveText, autosave); dialog.querySelector('.appearance-footer')!.before(autosaveLabel);
  mountLanguageSettings(dialog);
  document.body.append(dialog);
  const theme = dialog.querySelector<HTMLSelectElement>('#appearance-theme')!;
  const compact = dialog.querySelector<HTMLInputElement>('#appearance-compact')!;
  const font = dialog.querySelector<HTMLInputElement>('#appearance-font')!;
  function fields() { settings.theme=themePreference(); theme.value = settings.theme;dialog.querySelectorAll<HTMLButtonElement>('[data-theme-option]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeOption===settings.theme)));dialog.querySelector('#appearance-effective')!.textContent=(settings.theme==='system'?tr('Sistema · '):tr('Tema '))+(resolvedTheme()==='dark'?tr('escuro ativo'):tr('claro ativo')); compact.checked = settings.compact; font.value = String(settings.fontSize); dialog.querySelector('output')!.textContent = settings.fontSize + tr(' px'); }
  theme.onchange = () => { settings.theme = theme.value as Settings['theme']; apply();fields(); };
  dialog.querySelectorAll<HTMLButtonElement>('[data-theme-option]').forEach(button=>button.onclick=()=>{settings.theme=button.dataset.themeOption as ThemePreference;apply();fields();});
  compact.onchange = () => { settings.compact = compact.checked; apply(); };
  font.oninput = () => { settings.fontSize = Number(font.value); fields(); apply(); };
  document.getElementById('appearance')!.onclick = () => { fields(); dialog.open?dialog.close():dialog.show(); };
  dialog.querySelector<HTMLButtonElement>('#appearance-close')!.onclick = () => dialog.close();
  dialog.querySelector<HTMLButtonElement>('#appearance-reset')!.onclick = () => { settings = { ...defaults }; apply();fields(); };
  for (const side of ['left', 'right'] as const) {
    const handle = document.createElement('div'); handle.className = `panel-resizer ${side}`; handle.tabIndex = 0;
    handle.setAttribute('aria-valuemin', side === 'left' ? '180' : '240'); handle.setAttribute('aria-valuemax', side === 'left' ? '420' : '480'); handle.setAttribute('aria-valuenow', String(settings[side]));
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical'); handle.setAttribute('aria-label', side === 'left' ? tr('Largura do projeto') : tr('Largura das ferramentas'));
    const main = document.querySelector('main')!; main.append(handle);
    function set(value: number) { settings[side] = Math.round(Math.min(side === 'left' ? 420 : 480, Math.max(side === 'left' ? 180 : 240, value))); handle.setAttribute('aria-valuenow', String(settings[side])); apply(); }
    handle.onpointerdown = event => { handle.setPointerCapture(event.pointerId); event.preventDefault(); };
    handle.onpointermove = event => { if (!handle.hasPointerCapture(event.pointerId)) return; const bounds = main.getBoundingClientRect(); set(side === 'left' ? event.clientX - bounds.left - 40 : bounds.right - event.clientX - 40); };
    handle.onpointerup = event => handle.releasePointerCapture(event.pointerId);
    handle.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); set(settings[side] + (event.key === 'ArrowRight' ? 10 : -10) * (side === 'right' ? -1 : 1)); } };
  }
  const toggle=document.createElement('button');toggle.id='theme-toggle';document.getElementById('appearance')!.before(toggle);
  function syncTheme(){settings.theme=themePreference();monaco.editor.setTheme(resolvedTheme()==='dark'?'independent-dark':'independent-light');const label=resolvedTheme()==='dark'?tr('Usar tema claro'):tr('Usar tema escuro');toggle.setAttribute('aria-label',label);toggle.title=label;toggle.innerHTML=resolvedTheme()==='dark'?'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg>':'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/></svg>';fields();}
  toggle.onclick=()=>setThemePreference(resolvedTheme()==='dark'?'light':'dark');
  window.addEventListener('ide-theme-changed',syncTheme);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialog.open){dialog.close();document.getElementById('appearance')!.focus();}});
  document.addEventListener('pointerdown',event=>{if(dialog.open&&!dialog.contains(event.target as Node)&&!(event.target as Element).closest('#appearance,#theme-toggle'))dialog.close();});
  apply();syncTheme();
}

