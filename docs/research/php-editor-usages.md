# PHP — categorias visuais e referências nas declarações

## Evidência da referência

Em 22/10/2026 o usuário forneceu dois screenshots do mesmo trecho de `probe.php`. No primeiro, nossa IDE não distinguia visualmente chamadas de métodos e variáveis do texto comum. No segundo, PhpStorm mostrava variáveis em violeta, chamadas em azul, o nome do construtor em itálico e `no usages` acima de `describe`, com o nome esmaecido. A versão, configuração e estado da indexação do PhpStorm não foram registrados. A evidência é visual fornecida pelo usuário, não um ensaio comparativo controlado.

O significado dos sublinhados amarelos não pode ser determinado apenas pela imagem: eles não são evidência de métodos sem uso. Nenhuma inspeção nova foi inventada a partir desses sublinhados.

## Implementação independente

- O lexer PHP existente identifica variáveis, chamadas de métodos, nomes de funções/métodos declarados, construtores e alguns tipos nativos. Esses dados alimentam tokens semânticos Monaco, em UTF-16, com paleta clara/escura própria. Trata-se de classificação sintática local, não de inferência completa de tipos. Comentários, strings e HTML não produzem declarações falsas.
- Um provider CodeLens separado preserva os atalhos de execução de testes já existentes. Acima de funções e métodos com corpo, exibe análise pendente, contagem de usos, ausência de referências no índice, indisponibilidade ou necessidade de salvar. O clique abre a lista de referências existente.
- A contagem usa `textDocument/references` do Phpactor com `includeDeclaration:false`, já configurado no backend Rust. Remove duplicações e uma eventual localização da própria declaração. Não usa contagem de palavras ou ocorrência de nomes em comentários/strings.
- A primeira requisição PHP aguarda a indexação inicial no backend. Consultas de contagem são serializadas e iniciam após debounce de 900 ms; não bloqueiam a edição. Só o documento ativo recebe novas consultas.
- Quando o índice retorna zero referências, esmaece somente o nome da declaração elegível. Métodos mágicos não recebem contagem; assinaturas abstratas/interface não são classificadas. Métodos não privados de traits e de classes com herança/contratos podem ter contagem, mas não esmaecem por ausência de referências.
- Modificação de qualquer buffer PHP aberto impede novas contagens confiáveis no documento ativo. Editar ou trocar o documento invalida respostas pendentes e remove o destaque antigo. Após salvar ou observar alteração PHP no projeto, reavalia. Falha de consulta nunca significa zero usos.

## Limites

`Sem usos no índice` significa que a consulta não encontrou referências; não prova que o método pode ser removido. Chamadas dinâmicas, reflexão, frameworks, consumers externos, limitações do motor e alterações ainda em indexação podem afetar os resultados. Não há análise de alcançabilidade nem ação automática de excluir código. A contagem não inclui buffers PHP não salvos. A indexação incremental depende do watcher e do Phpactor; não existe garantia de snapshot transacional entre arquivos. Blade e interpolação dentro de strings não recebem este novo provider de tokens PHP. Não implementa aqui as demais inspeções amarelas do screenshot.

## Aceitação e testes próprios

1. Variáveis e chamadas de métodos têm cores distintas; comentários/strings não são classificados como código.
2. Funções e métodos com referências reais não esmaecem; declarações elegíveis sem referências exibem estado de ausência e nome esmaecido.
3. Comentários/strings com o nome não contam como referências.
4. Clicar na contagem abre o painel de usos.
5. Falha do índice, edição e resposta atrasada não geram marcação falsa a partir de zero presumido.
6. Execução de testes por CodeLens continua em provider separado.

Scripts: `scripts/check-php-editor-analysis.ts`, `scripts/check-editor-selection.mjs --webkit` e `scripts/check-native.mjs --packaged --no-db --insights-only`. O último usa `fixtures/php-intelligence/usage-insights.php` num projeto descartável, Phpactor real e janela Tauri empacotada. Screenshot próprio: `.artifacts/php-usage-analysis-dark.png` (fixture com transporte simulado; não comprova indexação real).

Estado: implementada; validação comparativa com PhpStorm permanece pendente.

## Resultado desta entrega

Typecheck, catálogos de idiomas, 22 testes Rust e testes do analisador passaram. O ensaio WebKit passou com cores distintas, contagem positiva/zero, clique no CodeLens, erro de índice e descarte de resposta atrasada. O ensaio Tauri empacotado com Phpactor real passou: três declarações esmaecidas sem referências, duas declarações usadas com uma referência cada e remoção do destaque ao editar. Não houve comparação controlada com uma execução do PhpStorm nesta entrega.
