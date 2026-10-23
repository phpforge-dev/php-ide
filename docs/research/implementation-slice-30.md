# Recorte 30 — Regressão do resize de Services (Docker) no smoke nativo

## Problema

Após a fundação Islands (recorte 28), `node scripts/check-native.mjs --no-db` falhava no check Docker com `Services não redimensionou`. O recorte 29 registrou a falha sem corrigi-la (trabalho paralelo na fundação visual).

## Evidência

- O smoke dispara `ArrowUp` em `#docker-resize` e exige `clientHeight` maior.
- `resizeToolWindow` grava a altura em `localStorage` (`php-ide-docker-height`). O perfil de estado do smoke (`PHP_IDE_STATE_DIR`) é descartável, mas o **WKWebView reutiliza o LocalStorage** em `~/Library/WebKit/dev.php-ide.desktop/…`.
- Observação local: valor persistido `412`. Cada execução bem-sucedida somava +20 px; ao atingir o teto (`min(70% do .code, …)`), `ArrowUp` virava no-op e o assert falhava.
- Em Chrome/Playwright com storage limpo (viewport 1440×940) o mesmo fluxo crescia 340→360; a falha é do perfil nativo compartilhado, agravada pelo shell Islands (`.code` com `overflow:visible` sem `min-height:0`).

Não é incompatibilidade com o PhpStorm; é regressão do nosso smoke/redimensionamento.

## Correção (própria)

| Arquivo | Mudança |
|---|---|
| `src/tool-window.ts` | Recalcula o teto a cada apply (`70%` e reserva de 120 px para o editor); restaura `localStorage` só com pai já medido (`rAF` se preciso); setas usam a altura em `style` como fonte da verdade. |
| `src/workbench.css`, `tool-windows.css`, `composer-panel.css` | Remove `max-height:70%` dos painéis que usam `resizeToolWindow` — o JS é a única trava (evita style alto + used height no teto CSS). |
| `src/islands-shell.css` | `.code{min-height:0}` com `overflow:visible` (item de grid não infla pelo conteúdo). |
| `src/native-smoke.ts` | Antes do assert, força baseline `260px` e grava essa altura no storage — smoke determinístico entre execuções. |

## Validação (2026-10-23, macOS arm64)

- `npm run typecheck` — ok
- `npm test` — 62 ok / 5 ignorados
- `node scripts/check-native.mjs --no-db` — ok (inclui Docker/Services resize), ~45 s
- `npm run test:native` — ok (PostgreSQL 16 + MySQL 8.4 descartáveis), ~72 s
- `graphify update .` — após as mudanças

## Compatibilidade

Nenhum item do catálogo promovido a “compatível neste perfil”. Só correção de regressão própria + base para as fatias de fidelidade visual seguintes.
