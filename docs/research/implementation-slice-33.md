# Recorte 33 — Diálogos/config + tema claro (fidelidade Islands)

Objetivo: alinhar superfícies de configuração e diálogos aos screenshots PhpStorm 02/24/25/26/33, e corrigir contraste/bordas no tema claro (40–46), só com tokens Islands — sem reescrever `islands-palette.py`.

## Classes de evidência

- **O:** screenshots locais `.artifacts/phpstorm-reference/` (`02-trust-dialog`, `24-settings-root`, `25-settings-appearance`, `26-settings-keymap`, `33-local-history`, `40`–`46` light).
- **T:** tokens já gerados em `src/themes.css` (recorte 28 / `SOURCE.md`); valores light conferidos — **sem** mudança na tabela do gerador.
- **R:** painel Aparência continua não modal (lateral); Settings completo com árvore lateral não existe nesta IDE; “Pré-visualizar em modo seguro” no trust é botão desabilitado (sem sandbox de abertura).
- **H:** nenhum token novo inventado; bordas no light usam `--ij-popup-border` / `--ij-control-border` porque `--ij-border` (#E9EAEE) some sobre ilha branca (observado na prática + O 40/41).

Nada extraído da instalação PhpStorm.

## Tarefa A — diálogos / config

| Superfície | Arquivos | Mudança |
|---|---|---|
| Aparência | `theme-surfaces.css`, `appearance.ts` | Chrome Islands (`--ij-dialog`, controles 28 px, seções Tema / Opções da interface); amostras de tema intactas (literais Dark/Light). |
| Keymap | `keymap.css` | Dialog Islands (lista em `--ij-island`, footer `--ij-popup-footer`, hover `--ij-list-hover`, Inter / tokens); remove hover `--raised` (invisível no light). |
| Plugins | `plugin-manager.css` | Mesmo chrome; cards em `--ij-island`; primary/`link` por tokens. |
| Trust | `welcome.ts`, `welcome.css`, `theme-surfaces.css` | Diálogo O:02 (ícone aviso, checkbox pasta-pai, Não abrir / Pré-visualizar desabilitado / Confiar); persistência `localStorage` `php-ide-trusted-roots`. Recentes pedem confiança antes de abrir; Abrir fecha o projeto se recusar após o picker. Novo/clonar marca confiança automaticamente. |
| Local History / diff | `workbench.css` | Layout O:33 — lista `--ij-island-alt`, seleção `--ij-selection`, área Monaco `--ij-editor-bg`, Restaurar como primary. |
| Shell | `islands-shell.css` | Inclui keymap/plugins/local-history/trust/project/welcome no chrome de popup/dialog. |
| Smoke | `startup-smoke.ts` | Clica `.trust-dialog .primary` se o diálogo aparecer ao reabrir recente. |

## Tarefa B — tema claro

- Tokens light em `themes.css` / `theme.ts` conferidos contra a tabela do recorte 28 — **ok**; gerador não alterado.
- Correções de superfície (não de paleta):
  - `color:white` em `.project-dialog .primary` → `--ij-button-default-text`.
  - Regras `:root[data-theme=light]` em `theme-surfaces.css` forçam `--ij-popup-border` / `--ij-control-border` e hovers `--ij-list-hover` em diálogos/config.
  - Keymap/plugins/local-history/appearance passam a tokens `--ij-*` em vez de `--border`/`--panel`/`--muted` genéricos onde o light perdia contraste.

## Validação

- `npm run typecheck` — ok
- `npm run test:locales` — ok (1138)
- `graphify update .` — após as mudanças
- **Não** executado: `check-native` / `test:native` (pedido da tarefa)

## Limitações

- Sem Settings unificado com árvore (Appearance & Behavior / Keymap / Plugins são diálogos separados; Aparência é painel lateral).
- Trust: sem “Preview in Safe Mode”; confiança só local; Abrir pasta ainda abre no backend antes do prompt (recusa chama `closeProject`).
- Local History: diff Monaco side-by-side já existia; toolbar da referência (whitespace, highlight words, “N differences”) não foi replicada.
- Light: avatar/toolbar com tint do projeto e abas VCS coloridas continuam fora deste recorte; Search Everywhere foi tocado noutra fatia paralela — aqui não foi reescrito.
- Não promove famílias do catálogo a “compatível neste perfil”.
