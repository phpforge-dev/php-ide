# Recorte 35 — Search Everywhere fechado ainda cobria o editor (Cmd+clique)

23/10/2026. Após as fatias de fidelidade Islands (31–34), o smoke nativo falhava em três checks de Cmd+clique / referências, com status “Análise PHP pronta”. Não era Phpactor nem hit-test de coordenadas do Monaco em si.

## Evidência

- `getTargetAtClientPoint` devolvia `MouseTargetType.UNKNOWN` (0) com `position: null` no ponto do símbolo.
- `elementsFromPoint` listava `DIALOG` acima de `view-lines` / `mtk*`.
- `#search-everywhere` tinha `open: false`, mas `getBoundingClientRect()` ainda ~560×217 px sobre o editor (o clique em `label` caía dentro desse retângulo).
- Causa: em `src/search-everywhere.css` (recorte 31), `#search-everywhere{…display:flex…}` sobrescrevia o UA `dialog:not([open]){display:none}`. O popup “fechado” continuava pintado e interceptava o hit-test do Monaco.

Mesmo padrão já usado em `#keymap-dialog` (`display:none` + `[open]{display:flex}`).

## Correção (própria)

| Arquivo | Mudança |
|---|---|
| `src/search-everywhere.css` | `display:none` por padrão; `#search-everywhere[open]{display:flex}` |
| `src/native-smoke.ts` | Espera “Preparando análise PHP” sair antes dos Cmd+clique (índice lento sob shell Islands); sem mudar a asserção de navegação |

Suggest/hover em `islands-shell.css` permanece só chrome (borda/raio/sombra/seleção), sem `width`/`overflow` que quebrassem layout do Monaco.

## Validação (2026-10-23, macOS arm64)

- `npm run typecheck` — ok
- `npm test` — 62 ok / 5 ignorados
- `node scripts/check-native.mjs --no-db` — ok (inclui Cmd+clique, referências, classes/aliases)
- `npm run test:native` — ok (PostgreSQL 16 + MySQL 8.4 descartáveis)
- `graphify update .` — após as mudanças

## Compatibilidade

Nenhum item do catálogo promovido a “compatível neste perfil”. Correção de regressão própria introduzida pela fidelidade visual do Search Everywhere; comparação lado a lado com a referência continua nos recortes 31–34 / 31a sem promoção de famílias.
