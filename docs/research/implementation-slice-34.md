# Recorte 34 — Editor / Markdown (prévia) vs referência 03

## Objetivo

Aproximar a prévia Markdown do screenshot `03-workbench-initial-dark` (e o modo claro correspondente) usando só tokens Islands.

## Mudança

- Novo `src/markdown-preview.css`: Inter (`--ij-font-ui`), fundo `--ij-island`, links `--ij-link`, tabelas zebradas com `--ij-island-alt` / `--ij-border`, código `--ij-font-mono`, toolbar com hover/seleção Islands.
- Import em `src/main.ts`; regras antigas removidas de `workbench.css` (evita conflito com outras fatias de fidelidade).

## Comparação (O)

| Item | Referência 03 | Nosso |
|---|---|---|
| Split editor \| preview | sim | sim (já existia) |
| Tipografia da prévia | sans do produto | Inter 13 px |
| Tabelas | células com borda fina, header distinto | borda `--ij-border`, th/zebrado `--ij-island-alt` |
| Links | azul de link | `--ij-link` |

## Limitações

- Sintaxe Markdown no editor (headers roxos etc.) continua no Monaco/`editor-theme.ts` — não refeita nesta fatia.
- Breadcrumbs inferiores do editor, gutter de folding e faixa de erros: ainda pendentes (notas do recorte 28).
- Sem promoção a “compatível neste perfil”.

## Validação

Ver relatório da sessão (typecheck / smoke após integração com as fatias 31–33).
