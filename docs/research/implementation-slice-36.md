# Recorte 36 — Moldura do editor (gutter, margem, faixa de erros, widget de inspeções)

Catálogo: UI-EDITOR-CHROME-001. Estado: **Em desenvolvimento / não validada comparativamente**.

## Ponto de partida

Paleta Islands, JetBrains Mono 13/22 px, abas e minimapa desligado já vinham dos recortes 28/31a/34. A área do editor ainda tinha a cara do Monaco/VS Code: ícones do gutter à esquerda dos números, números recuados (5 dígitos reservados), sem linha separadora, barra de VCS longe do código, régua lateral de 14 px com blocos da altura da linha, nenhuma margem direita e nenhum contador de problemas.

## Evidências (separadas)

| Tipo | Item |
|---|---|
| Documentação pública | Widget de inspeções no canto superior direito do editor com contagem por severidade e navegação entre problemas (F2/Shift+F2) — [Code inspections](https://www.jetbrains.com/help/phpstorm/code-inspection.html). Faixa de erros (error stripe) à direita. "Hard wrap at" padrão 120 em Code Style. JetBrains Mono (OFL). |
| Esquemas públicos (`design/reference/islands/`) | Cores `ERROR_STRIPE_COLOR` de identificador sob o cursor, escrita, busca, erro e aviso (claro e escuro); separador do gutter = cor da guia de indentação (`#323438` / `#EBECF0`, também medido nas capturas). |
| Observação autorizada (capturas 05 escuro e 40 claro) | Ordem do gutter: números (terminam a ~20 px), ícones, dobra; linha separadora vertical em ~79 px; barra de VCS encostada no separador; código ~3 px depois. Linha de margem na coluna 120 (40). Widget "⚠ 1 ⌃ ⌄" em ~45–60% de intensidade em repouso. Marcas da faixa: traços de ~2–3 px; mudanças de VCS como marca estreita. |
| Requisito próprio | Opacidade total ao passar o mouse; clique numa marca da faixa move o cursor; setas do widget movem o cursor e abrem o hover da mensagem; contagem "1 aviso"/"2 erros" no `aria-label`. |
| Hipótese | Info do Monaco = aviso fraco; cores de aviso fraco (`#868A91`/`#A8ADBD`); opacidade exata do widget. |

Nada foi extraído do produto: ícones do widget são SVGs próprios; tamanhos medidos nas capturas.

## Mudança

- `src/editor-chrome.ts` (`mountEditorChrome`, chamado em `src/main.ts` logo após criar o editor) e `src/editor-chrome.css`:
  - opções: margem de ícones sempre reservada, 3 dígitos mínimos, `lineDecorationsWidth` 14, `rulers: [120]`, realce da linha do cursor também no gutter, scrollbar fina arredondada, régua do Monaco desligada;
  - gutter na ordem do PhpStorm: o CSS troca as colunas de números e ícones; eventos de ponteiro na margem são remapeados para o hit test do Monaco continuar certo (clique no número seleciona a linha; clique no ícone chega como `GUTTER_GLYPH_MARGIN`, usado pelos plugins de debug/PHP);
  - linha separadora e barra de VCS do plugin Git encostada nela;
  - faixa de erros própria (12 px, traços de 3 px) lida de `getOverviewRulerDecorations()`; VCS como marca estreita à esquerda;
  - widget de inspeções (overlay no canto superior direito): ✓ verde sem problemas; contagem por severidade + setas anterior/próximo.
- `src/editor-theme.ts`: cores de faixa para identificador sob o cursor/escrita/busca/info.
- `src/themes.css`: `--ij-gutter-separator`, `--ij-editor-{error,warning,weak}-icon`.
- Locales: textos do widget.

## Validação

- `node scripts/check-editor-chrome.mjs` (Chromium, escuro e claro, 1512×949): sem minimapa; JetBrains Mono 13/22; números na borda esquerda; ícone do plugin PHP à direita do número; clique no número → linha, clique no ícone → margem de ícones; barra de VCS a ≤6 px do código; margem na coluna 120; linha do cursor no gutter; régua do Monaco ausente e faixa própria com aviso (linha 14) e VCS (linha 19); widget com "Nenhum problema encontrado" e depois "1 aviso"; seta "próximo" leva à linha 14. Capturas: `.artifacts/editor-fidelity/editor-{dark,light}.png`; antes/depois/referência: `.artifacts/editor-fidelity/compare-{dark,light}.png` (antes em `before/`).
- `npm run typecheck`, `npm test` (41 Rust), `check-locales`, `check-architecture`, `preview-workbench.mjs` (inclui clique na marca de VCS) aprovados.
- `check-editor-selection.mjs --webkit` falha igual sem esta mudança (fixture com `pluginList` desatualizado); não é regressão deste recorte.

## Correção: cursor e realce de palavra deslocados (30/10/2026)

Defeito relatado pelo usuário com captura: o realce da palavra sob o cursor não cobria a palavra inteira e o cursor ficava fora da posição clicada, com o erro crescendo ao longo da linha. Causa reproduzida: o Monaco mede a largura do caractere uma vez, ao criar o editor; JetBrains Mono usa `font-display: swap` e ainda não tinha sido carregada, então a medição usava a fonte de reserva enquanto o texto era desenhado em JetBrains Mono. Medido no harness: WebKit 8,039 px medidos × 7,800 px desenhados (~0,24 px por coluna, 5–7 px nas colunas 20–30); Chromium 7,828 × 7,800. Correção em `src/editor-chrome.ts`: carregar as quatro faces de JetBrains Mono e chamar `monaco.editor.remeasureFonts()` quando terminam (e a cada `loadingdone`). Depois: 7,8008 × 7,8000 nos dois motores. `check-editor-chrome.mjs` (agora com `--webkit`) falha se a diferença passar de 0,01 px. Não validado na janela Tauri (ver limitação do `test:native`).

## Limitações

- Breadcrumbs de código na base do editor (`\Fixture › User › label()`, captura 40) não implementados.
- Sem tool window Problems: clicar na contagem vai ao próximo problema em vez de abrir a lista. F2/Shift+F2 continuam no plugin `php-intelligence`, que abre o peek do Monaco (estilo VS Code); alinhar ao widget exige mudança no plugin.
- O estado "analisando" (ícone de olho) e a contagem de erros de digitação não existem.
- No New UI o breakpoint ocupa o lugar do número da linha; aqui continua na coluna de ícones.
- A posição da barra de VCS é ajustada por CSS do host sobre classes do plugin Git (`.git-line-*`); o lugar certo é o próprio plugin.
- Marcas da faixa sem tooltip; cores só para ids conhecidos (`editorColors`), outros são omitidos.
- Editores de diff e o painel de revisão do Git não usam esta moldura.
- Medido em Chromium. `npm run test:native -- --no-db` (30/10/2026) não validou a janela Tauri: os plugins não ativaram no perfil de teste ("PHP Intelligence desativada", `PermissionDenied: workbench`), então Git/PHP/terminal falham antes de chegar ao editor; não houve execução de base sem esta mudança para comparar.
