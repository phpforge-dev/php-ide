# Recorte 32 — Fidelidade visual das tool windows (cabeçalhos, abas pílula, árvores)

## Objetivo

Alinhar a aparência das janelas de ferramentas à referência Islands Dark observada em `.artifacts/phpstorm-reference/` (09 Find, 16 Terminal, 17 Problems, 18 Commit, 19 Git Log, 21 Structure, 22 Run, 23 Debug, 28 Database, 29 Branches) e às notas de `docs/research/phpstorm-reference-2026-10-23.md`, usando os tokens públicos já mapeados no recorte 28 (`--ij-header-height` 40, `--ij-tab-*`, `--ij-row-height` 24).

Não extrai código do PhpStorm. Não altera `tool-window.ts` nem desfaz `.code{min-height:0}` do recorte 30. Ids usados por `native-smoke.ts` preservados.

## Classes de evidência

| Classe | Uso nesta fatia |
|---|---|
| **O** | Geometria nos screenshots 09/16–19/21–23/28 (cabeçalho ~40 px, título semibold, abas pílula como as do editor, hide/minimize à direita, linhas de árvore ~24 px). |
| **T** | `TabbedPane.tabHeight 40`, `EditorTabs.underlined*`, `Tree.rowHeight 24` (tokens em `design/reference/islands/`, já em `themes.css`). |
| **R** | Painéis nossos sem equivalente na referência (Composer, Testes, Services/Docker, Agent) recebem as mesmas métricas de cabeçalho/lista para consistência. |
| **H** | Raio exato de pílula secundária em tool windows (usamos o mesmo `--ij-tab-radius` 6 das abas do editor). |

## Entregas

| Arquivo | Mudança |
|---|---|
| `src/islands-shell.css` | Cabeçalhos unificados 40 px + `font-weight:600` (Project, Database, Commit, Terminal, Testes, Services, Debug, Composer, Git Log); botões hide (`#terminal-hide`, `#docker-hide`, `#debug-hide`, `#test-hide`, `#git-log-hide`, `#composer-hide`, `.hide-tool`) com ícone expui `hide`; abas pílula (ativas/inativas) em Terminal, Docker, Git switch, Debug, Database dialog, Test toggle; toolbar secundária do Git Log permanece compacta (~32 px); linhas 24 px em árvores/listas das tool windows. Preserva `.code{min-height:0}`. |
| `src/tool-windows.css` | Base: cabeçalho 40 px, aba pílula, Git/Services/Docker/Git Log com métricas alinhadas (sem depender só do override Islands). |
| `src/workbench.css` | Terminal / Testes / Services / Database / Commit / árvore do projeto: mesmos alvos (40 / 600 / pílula / 24). |
| `src/debug-panel.css` | Toolbar 40 px, título 600, abas pílula, frames/variáveis em 24 px. |
| `src/composer-panel.css` | Toolbar 40 px, título 600, linhas de pacote 24 px. |

## Métricas alvo

| Item | Valor | Fonte |
|---|---|---|
| Cabeçalho (título + abas + ações) | 40 px | O; T `TabbedPane.tabHeight` |
| Título | `font-weight: 600`, Inter 13 | O 16/17/21/23/28 |
| Aba pílula | altura 28, raio 6, `--ij-tab-selected` / border | O (como editor); T EditorTabs |
| Hide | ícone expui 16 px em botão 24×24 | O; asset Apache em `assets/jetbrains-icons/general/hide_dark.svg` |
| Árvore / lista | linha 24 px | T `Tree.rowHeight`; O Project/Commit/Structure |

## O que melhorou

- Cabeçalhos deixam de misturar 30–36 px com underline clássico; ficam na faixa de 40 px da referência.
- Abas de tool window passam a pílula (mesmo token das abas do editor), inclusive Terminal e Docker.
- Botões “−” de ocultar usam o glyph hide ExpUI em vez do caractere tipográfico.
- Densidade das árvores/listas (Project, Commit, Git Log, Docker, Database, Debug, Testes, Composer) aproxima 24 px.
- Toolbar de filtro do Git Log não compete com o cabeçalho de título (compacta, separada).

## Limitações

- Não há tool windows Find / Problems / Structure / Run vazios como na referência — só os painéis que existem; métricas compartilhadas onde aplicável.
- Actions laterais verticais do Find (09) e toolbars densas de ícones do Commit/Database (18/28) não foram redesenhadas (só cabeçalho + densidade de lista).
- Screenshot 29 (Branches) é popup, não tool window; o popup já usa tokens de popup do recorte 28 — fora do escopo de cabeçalho dockado.
- Hide nos painéis inferiores continua à direita do cabeçalho; na referência às vezes há ⋮ + hide — o menu ⋮ por painel não foi inventado.
- Validação nativa (`check-native` / `test:native`) **não** foi executada nesta fatia (pedido explícito); só typecheck.

## Validação

- `npm run typecheck` — ok (sessão do recorte).
- `graphify update .` — após as mudanças.
- Não promover famílias do catálogo a “compatível” só por CSS.

## Compatibilidade

Nenhuma promoção no catálogo. Fatia só de fidelidade visual própria sobre tokens públicos + observação autorizada.
