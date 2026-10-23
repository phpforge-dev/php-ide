# UI-SEARCH-001 — Busca geral

Requisito do usuário em 22/10/2026: dois toques no Shift devem abrir uma busca geral, como no PhpStorm.

Referência documental: [JetBrains — Search Everywhere](https://www.jetbrains.com/help/phpstorm/searching-everywhere.html). O usuário relatou o acionamento por Shift duplo; não houve ensaio comparativo controlado com a referência nesta entrega. A implementação usa componentes próprios, Monaco, APIs de arquivos Rust e a interface pública LSP. [Phpactor documenta Workspace Symbols para classes, funções e constantes](https://phpactor.readthedocs.io/en/master/lsp/support.html).

## Fluxos implementados

- Shift duplo isolado abre um diálogo modal com campo focado. Cada toque deve durar até 300 ms, com até 450 ms entre liberações. Outras teclas, combinações com modificadores, repetição, composição IME, cliques e perda de foco invalidam o gesto. Não abre por cima de outro diálogo.
- O botão de busca na barra superior e a ação “Buscar em tudo” da paleta oferecem alternativas ao gesto.
- Categorias: Tudo, Classes, Arquivos, Símbolos, Ações e Texto. As categorias são botões acessíveis; Tab percorre os controles. Setas movem o resultado ativo, Enter executa e Escape restaura o foco anterior.
- Arquivos usam listagem confinada ao projeto, com inclusão opcional de vendor. O cache dura uma abertura e é invalidado ao alterar o escopo ou receber alteração PHP. A listagem exclui diretórios técnicos conforme a API existente, limitada a 50 mil arquivos.
- Classes e símbolos usam `workspace/symbol` do Phpactor, por novo comando restrito `searchSymbols`, com consulta não vazia e até 256 bytes. O backend aguarda a indexação inicial já existente. As consultas são serializadas e as que ficam obsoletas na fila são descartadas antes de consultar o servidor.
- Ações incluem atalhos para ferramentas reais da IDE e ações suportadas pelo editor. A seleção explícita dispara somente ações registradas; a busca não interpreta nem executa texto como comando de shell.
- Texto usa a busca literal Rust existente: a partir de dois caracteres, sem vendor, até 500 linhas encontradas, arquivos de até 2 MB. A categoria Tudo acrescenta texto a partir de três caracteres. O resultado abre arquivo, linha e coluna.
- Debounce de 180 ms e geração por consulta evitam sobrescrever a consulta atual com respostas antigas. Arquivos e ações continuam disponíveis durante a análise PHP. Erros aparecem no diálogo. A janela limita a apresentação a 100 linhas e conserva no máximo 300 resultados combinados.

## Diferenças e limites

Não há ranking, abreviações, fuzzy matching ou histórico equivalentes aos do PhpStorm. Arquivos e ações usam substring sem diferenciar caixa; texto é literal e sensível à caixa. A listagem truncada em 50 mil arquivos não tem paginação. O filtro Classes usa os tipos LSP classe/interface/enum/struct; a distinção de traits depende do tipo retornado pelo servidor. Workspace Symbols do Phpactor não é um catálogo completo de membros: métodos/propriedades podem ser encontrados por texto, mas não se presume cobertura semântica integral deles nessa API. Ações abrangem o editor e ferramentas registradas, sem catálogo de cada campo de configuração. Não pesquisa histórico Git, conteúdo de bancos, documentação online ou referências externas ao projeto. O índice de símbolos usa arquivos no disco; alterações ainda não salvas podem não aparecer. A busca exige projeto aberto.

## Aceitação e evidências próprias

1. Shift duplo abre com foco na consulta; Shift + setas seguido de Shift não abre.
2. Arquivo pode ser aberto pelo teclado; símbolo abre na posição retornada.
3. Categorias, vendor e texto oferecem resultados distintos; uma ação pode abrir Aparência.
4. Erro de índice fica visível e remove resultados obsoletos.
5. Escape fecha e preserva o estado do editor.

`scripts/check-editor-selection.mjs --webkit` passou com teclado e mouse reais e transporte simulado para essas categorias, ação, vendor e erro. Screenshot próprio: `.artifacts/search-everywhere-dark.png`. `scripts/check-native.mjs --packaged --no-db --search-only` passou com Shift duplo, abertura de arquivo, classe User e função describe via Phpactor real, além da rejeição de consulta vazia. Typecheck, catálogos de idiomas e 22 testes Rust passaram.

Estado: implementada e testada na nossa IDE; compatibilidade comparativa com PhpStorm não validada.
