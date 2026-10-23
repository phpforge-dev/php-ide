# Recorte 31a — Conferência da fundação Islands (janela real)

Complemento ao recorte 28. Objetivo: ver a fundação na WKWebView (não só Chrome headless) e confrontar com `.artifacts/phpstorm-reference/` `03`, `05`, `40`.

## O que foi feito

1. `node scripts/preview-islands.mjs` regenerou `.artifacts/fidelity/foundation-*.png` (1512×949).
2. Smoke nativo completo (`npm run test:native`, recorte 30) confirma que a WKWebView renderiza o shell (ilhas, faixas, abas, status) sem regressão funcional.
3. Tentativa de `screencapture -l` da janela Tauri (mesmo padrão do `--compare-p0`): a janela aparece (940 px de altura), mas o processo atual recebe `could not create image from window` (permissão de Screen Recording / TCC). Sem captura nativa nova nesta sessão.

## Comparação (prévia headless × referência)

Lado a lado já existente: `foundation-compare-dark.png` / `foundation-compare-light.png` (referência 05/40 à esquerda). Observações (O), sem promover compatibilidade:

| Área | Próximo da referência | Ainda diverge |
|---|---|---|
| Ilhas / calha | Raio ~10, fundo `--ij-window` vs `--ij-island` | Barra de título nativa do SO (PhpStorm unifica) |
| Faixas 40 px + ícones expui | Ordem e estados abertos | Sem Structure/Find/Problems/IA (sem tool window) |
| Abas pílula | Seleção azul `--ij-tab-selected` | Sem cor VCS no nome do arquivo |
| Editor / sintaxe | JetBrains Mono 13/22; tokens públicos | Gutter Monaco (ícones à esquerda dos números); inlays ainda “Analisando…” sem contagens estáveis na prévia |
| Árvore | Linha 24 px, Inter | Seleção nem sempre azul de foco; ícones PHP próprios |
| Status bar | Widgets reais (posição, LF, indent) | Texto `Ln X, Col Y · UTF-8` (testes dependem); sem “PHP: 8.2” / Trial |
| Light (`40`) | Mesma geometria, tokens light | Idem limitações do dark |

## Conclusão

Fundação **usable na WKWebView** (evidência: smoke nativo). Fidelidade geométrica/token **parcial** vs 03/05/40; **não** marcar UI-THEME/UI-LAYOUT como “compatível neste perfil” só por esta conferência. Ajustes por área: recortes 31+ (popups), 32 (tool windows), 33 (diálogos/light), editor/Markdown em seguida.
