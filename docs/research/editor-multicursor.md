# Edição com múltiplos cursores

Requisito do usuário em 22/10/2026: editar várias linhas/ocorrências de uma vez, seguindo a experiência do PhpStorm.

Referências públicas: [PhpStorm — múltiplos cursores](https://www.jetbrains.com/help/phpstorm/multicursor.html) e [JetBrains Guide — editar em vários pontos](https://jb-guide-prod.labs.jb.gg/guide/tips/multiple-cursor/). Esses documentos descrevem ocorrências e posicionamento de cursores; não constituem teste de paridade com uma instalação específica ou keymap personalizado.

## Comportamento implementado

O Monaco já possuía o motor de seleção/edição múltipla. A integração define Alt/Option como modificador do mouse, mantém a colagem distribuída por linha e o merge de seleções sobrepostas. Adiciona ações traduzidas ao menu de contexto e à paleta, e exibe a quantidade de cursores e o modo coluna no rodapé.

| Fluxo | macOS | Windows/Linux |
|---|---|---|
| Adicionar/remover cursor com mouse | Option + clique | Alt + clique |
| Próxima ocorrência | Control + G | Alt + J |
| Todas as ocorrências | Control + Command + G | Control + Alt + Shift + J |
| Remover último cursor | Control + Shift + G | Alt + Shift + J |
| Cursor acima/abaixo | Command + Option + ↑/↓ | Control + Alt + ↑/↓ |
| Cursores no fim das linhas selecionadas | Option + Shift + I | Alt + Shift + I |
| Voltar a um cursor | Escape | Escape |
| Modo coluna | Menu: Alternar seleção em coluna | Menu: Alternar seleção em coluna |

Selecionar as linhas e executar “Adicionar cursores às linhas selecionadas” cria um ponto de edição no fim de cada linha. Digitação, exclusão e undo usam as operações nativas Monaco. Seleção de ocorrências atua sobre texto no arquivo atual; não é uma refatoração Rename Symbol entre arquivos. O modo coluna permite a seleção retangular e continua ativo até ser alternado novamente pelo menu.

Os atalhos de cursores acima/abaixo e fim das linhas são escolhas da nossa integração sobre as ações Monaco; não se presume equivalência com todos os keymaps PhpStorm. Alguns sistemas operacionais podem capturar atalhos globais; as ações permanecem disponíveis pelo menu. Ctrl/Command + clique continua reservado à navegação de código. Não há editor de keymaps personalizado nesta entrega.

## Aceitação e evidências próprias

- Alt/Option + clique cria múltiplos pontos de edição e a digitação muda todos.
- Próxima/todas as ocorrências funcionam pelos atalhos; remover último cursor e Escape reduzem a seleção.
- Linhas selecionadas recebem cursores; edição simultânea pode ser desfeita em uma operação.
- Rodapé informa a quantidade de cursores e o modo coluna.
- Os testes de seleção, temas e navegação existentes continuam passando.

`scripts/check-editor-selection.mjs --webkit` usa mouse e teclado reais num fixture com transporte simulado. `scripts/check-native.mjs --packaged --no-db --editor-only` verifica os comandos na janela Tauri, edição simultânea, undo e estado do modo coluna. Não houve ensaio comparativo controlado com PhpStorm nesta entrega.

Estado: implementada. Compatibilidade comparativa: pendente.

## Resultado

Typecheck, traduções e 22 testes Rust passaram. Teste WebKit passou com teclas e cliques reais, edição simultânea em ocorrências e linhas, undo e contagem/mode coluna. Os dois grupos de seleção passaram na janela Tauri empacotada, incluindo a interface em inglês. O teste do destaque após troca de tema aguarda a renderização real da seleção; a expectativa do rótulo de coluna respeita o idioma da interface.
