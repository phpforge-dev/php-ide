# Recorte 02 — navegação e atualização do índice

Data: 21/10/2026. Requisitos próprios; sem novo oracle do PhpStorm nesta rodada.

## Contratos reproduzíveis

Fixture sintético isolado criado por `tests/integration/navigation.test.ts`, namespace Sample, interface Worker::run, classes First/Second implementadoras, Other homônima sem relação, probe com uma chamada First::run, uma chamada Other::run e uma string `run`.

| Caso | Critério | Estado |
|---|---|---|
| NAV-REF-02 | First::run retorna exatamente probe.php, linha 4; exclui Other e string | Aprovado no teste local |
| NAV-IMP-02 | Worker::run retorna exatamente First e Second | Aprovado no teste local |
| IDX-ADD-02 | Criar Third implementadora adiciona exatamente Third sem reiniciar | Aprovado no recorte local |
| IDX-EDIT-02 | Remover implements de Third retira Third do conjunto | Aprovado no recorte local |
| IDX-DELETE-02 | Excluir Second retira seu destino | Aprovado no recorte local |
| UI-REF-02 | Abrir arquivo, F12, localizar método e Encontrar usos apresenta resultados navegáveis | Aprovado no recorte local |

As mudanças de disco passam pelo mesmo watcher usado na aplicação, sem injetar resultados nem simular servidor. A convergência é limitada a 10 segundos por alteração no fixture pequeno, com medição local. Isso não constitui benchmark em projetos grandes.

## Investigação do problema incremental

A baseline não anunciava suporte a eventos de arquivos no initialize. A versão fixada do Phpactor também não inclui `lsp` na lista padrão de watchers permitidos. A integração agora anuncia `didChangeWatchedFiles` e configura `indexer.enabled_watchers` para `lsp` por argumento de configuração. A mensagem do servidor confirmou “LSP file events”. Isso, isoladamente, não encerrou o teste: o destino novo ainda não apareceu. O watcher da dependência aplica interseção aos globs de inclusão; os padrões padrão PHP/PHAR impedem que um caminho corresponda a ambos. O adaptador usa apenas `/**/*.php` neste recorte. Mesmo assim, o evento recebeu ACK sem atualizar o conjunto de implementações no fixture. A integração solicita, portanto, `phpactor/indexer/reindex` com `soft: true`, agrupando eventos por 200 ms, reutilizando cache e mantendo o mesmo processo.

Consultas aguardam uma atualização já conhecida, com limite de 30 segundos. Na corrida em que uma exclusão é detectada primeiro pela consulta, há uma única nova tentativa após o watcher registrar a atualização. Outros erros continuam sendo propagados. O teste de convergência registra erros transitórios de arquivo removido, se ocorrerem, e exige o conjunto correto antes de aprovar; não substitui erro por lista vazia.

O ciclo exercita criação, gravação atômica via Workspace.save, exclusão e reinício do servidor com o mesmo cache. Não é uma atualização puramente dirigida a eventos nem prova de desempenho em bases grandes. A causa completa da resposta desatualizada do caminho LSP não foi atribuída a um único componente.

Fontes open source da versão fixada: [LanguageServerWatcher](https://github.com/phpactor/phpactor/blob/2026.10.07.0/lib/Extension/LanguageServerIndexer/Watcher/LanguageServerWatcher.php), [IndexerExtension](https://github.com/phpactor/phpactor/blob/2026.10.07.0/lib/Indexer/Extension/IndexerExtension.php), [IndexerHandler](https://github.com/phpactor/phpactor/blob/2026.10.07.0/lib/Extension/LanguageServerIndexer/Handler/IndexerHandler.php). [PatternWatcherProcess da dependência fixada](https://github.com/phpactor/amp-fswatch/blob/8b79e76b451d40a3367aae460883d90455dbeb1a/src/Watcher/PatternMatching/PatternWatcherProcess.php). Configurações públicas: [Phpactor](https://phpactor.readthedocs.io/en/master/reference/configuration.html#language-server-file-events). Nenhuma dessas fontes descreve a implementação interna do PhpStorm.

## Interface

Barra de navegação com Declaração/F12, Encontrar usos e Implementações. Ações ficam indisponíveis sem arquivo PHP. Consultas apresentam estado e ausência de resultados. O término de um progresso alheio ao índice não libera mais a barreira de indexação inicial.

## Limites mantidos

Generics identity<T>, vendor complexo, stubs fora da raiz, Windows e índices grandes continuam sem validação. Referências com herança complexa e alterações não salvas em vários arquivos exigem casos próprios. Compatibilidade com PhpStorm não foi promovida.

## Evidências de execução

- `npm run test:php`: testes reais de linguagem, navegação e índice; sem respostas simuladas.
- `npm run test:ui`: F12 abre User.php, Encontrar usos mostra probe.php e Implementações mostra User.php/Admin.php no Electron real, sem erros do renderer.
- Capturas próprias: `.artifacts/references.png` e `.artifacts/implementations.png`.
- Medições locais: `.artifacts/navigation-results.json`. Ambiente compartilhado macOS + Docker; startup inclui processo/protocolo/indexação de stubs. Uma amostra não é benchmark.
- `npm run build` inclui typecheck. O alerta de tamanho do bundle permanece.

## Próximo limite

Fechar a comparação comportamental com PhpStorm permanece pendente. A validação desta rodada é da implementação independente. Não promover PHP-USE-001, PHP-IMP-001 ou PHP-IDX-001 como famílias compatíveis. Arquivos PHAR de projeto não integram o glob deste recorte; stubs já fornecidos pelo motor continuam sendo tratados por sua configuração própria.

### Última amostra local aprovada

| Medida | Tempo |
|---|---|
| Startup frio (processo, protocolo e índice) | 44553 ms |
| Startup com cache | 1841 ms |
| Criar implementação → resultado correto | 488 ms |
| Gravar alteração → resultado correto | 377 ms |
| Excluir arquivo → resultado correto | 7190 ms |

Erros transitórios de arquivo removido expostos ao teste nesta última execução: 0. A exclusão ainda levou aproximadamente 7 segundos; esse tempo é uma limitação real do recorte. A espera/repetição evita apresentar a primeira falha ao usuário, mas não torna a atualização instantânea. Startup frio variou conforme carga compartilhada; não extrapolar estes números.
