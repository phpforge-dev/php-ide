# Recorte 31 — Fidelidade visual dos popups (Islands 2026.1)

23/10/2026. Escopo **só popups** (Search Everywhere, Show Usages / Goto Implementation, menus de contexto, completion Monaco, refactor toast/diálogos leves, branches/recentes). Não altera shell, editor nem tool windows. Não extrai nada do PhpStorm; comparação visual contra screenshots locais em `.artifacts/phpstorm-reference/` e tokens `--ij-*` de `src/themes.css` (recorte 28).

## Screenshots comparados (OBS)

| Artefato | Uso nesta fatia |
|---|---|
| `04-goto-file-popup` | Go to File / Search Everywhere (aba Files): raio ~8, abas pílula, seleção inset, rodapé com caminho |
| `06-search-everywhere-all` / `06b` | Abas All…Text, tab selected azulada, lista com pílula, rodapé caminho + ação |
| `07-quick-doc` | Superfície popup (borda/fundo) alinhada aos tokens |
| `08-show-usages-popup` | Usages: fundo `--ij-popup`, seleção pílula, rodapé secundário |
| `10-goto-implementation` | Mesma família de popup de lista (chooser) |
| `13-completion` | Suggest Monaco: raio, borda, seleção, status/footer |
| `14-rename` | Diálogo/inline de rename — tokens de diálogo/popup nos wrappers nossos |
| `15-intentions` | Menu tipo contexto: seleção pílula inset |
| `31-editor-context-menu` | Menu do editor: raio 8, borda, hover/seleção pílula, separadores |

Notas visuais consolidadas em [phpstorm-reference-2026-10-23.md](phpstorm-reference-2026-10-23.md) (§ Popups). Valores de cor vêm dos tokens públicos em `design/reference/islands/` (não empacotados).

## O que mudou (próprio)

| Área | Mudança |
|---|---|
| `src/search-everywhere.css` + `.ts` | Chrome com abas Islands (`--ij-search-tab-selected`, raio de aba); sem título “Buscar em tudo”; fundo/borda `--ij-popup` / `--ij-popup-border` / `--ij-popup-radius`; linhas com margem e pílula `--ij-selection`; rodapé `--ij-popup-footer` + caminho do item selecionado |
| `src/workbench.css` | `usages-popup`, `git-line-popup`, `recent-projects`, `context-menu`: raio 8 via token, fundo popup, seleção inset, rodapé advertiser |
| `src/islands-shell.css` | Reforço comum de popups/menus; Monaco suggest/hover/hints com borda popup, linhas com margem + `focused` = `--ij-selection`, status = footer |
| `src/theme-surfaces.css` | Branches popup e superfícies de menu alinhados aos mesmos tokens |
| `src/refactor.css` | Diálogo/toast/lista de preview com tokens de popup e seleção pílula |

Sem hex novos: só variáveis `--ij-*` já definidas no recorte 28.

## Limitações restantes

- **Search Everywhere:** não há “Open In Right Split”, filtros/ícones à direita das abas, nem destaque de match amarelo como na referência; “Incluir vendor” ≠ “Include non-project items”. O `display:flex` incondicional desta fatia deixava o diálogo fechado cobrindo o editor — corrigido no [recorte 35](implementation-slice-35.md).
- **Usages / Implementation:** layout interno (toolbar de pin, dropdown “Project Files”, sintaxe colorida na linha) ainda é o MVP nosso; só a casca visual ficou mais próxima.
- **Completion Monaco:** a pílula via CSS em `.monaco-list-row` é aproximação; o widget interno (ícones, match color, tip “Next Tip”) continua do Monaco.
- **Context menu:** conteúdo/ícones/ações diferem da 31; fidelidade é de superfície (raio, borda, seleção).
- **Quick Doc / Rename / Intentions:** preview lateral e rename inline do produto não foram recriados; diálogos nossos usam a mesma linguagem de tokens.
- **Validação:** `npm run typecheck` nesta fatia; **não** rodamos `check-native` / porta 1420. Screenshots de referência não são publicados (Welcome com dados pessoais).

## Compatibilidade

Nenhum item do catálogo promovido. Evidência = aparência própria + OBS dos screenshots listados; não implica equivalência funcional.
