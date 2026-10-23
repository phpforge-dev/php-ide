> Registro histórico do recorte 01. A continuação de referências, implementações e indexação está no [recorte 02](implementation-slice-02.md).

# Primeiro recorte executável — 21/10/2026

## Decisão e separação

Autorização: novo projeto em `~/Projects/php-ide`. A pesquisa anterior foi copiada, preservando o histórico no Meu Hinário. A implementação usa requisitos próprios e interfaces públicas; resultados de Phpactor não são evidência sobre o motor interno do PhpStorm. Nenhuma família ganhou validação comparativa nesta etapa.

## Arquitetura efetiva

Renderer TypeScript/Monaco → preload com API restrita → processo principal Electron → serviços separados de arquivos, linguagem, banco e agente.

`Workspace` confina caminhos à raiz real, rejeita escapes por symlink e faz escrita atômica com hash de conflito. `PhpLanguage` fala LSP com Phpactor fixado por checksum; buffers não salvos usam didOpen/didChange. O watcher informa alterações PHP no disco. `RpcProcess` separa framing LSP de JSONL do agente. `inspectConnection` usa pg/mysql2, com timeout e encerramento de conexão. `Agent` usa Codex app-server por stdio, sessão efêmera read-only e eventos de resposta.

Electron mantém Node desativado no renderer, isolamento de contexto e preload sandbox. Navegações externas são bloqueadas. Ferramentas de banco e agente são acionadas explicitamente. Projeto, cache e processo de linguagem têm ciclos separados.

## Design e experiência

Direção solicitada: mesma organização e linguagem de interação do PhpStorm. Implementação inicial: explorador à esquerda, abas/editor ao centro, ferramentas à direita, estado da análise no rodapé, tema escuro e atalhos. As cores/dimensões são escolhas próprias provisórias, não medições do design system JetBrains. Não foram copiados ícones, fontes ou assets da referência. O Monaco inclui seus próprios recursos licenciados.

A fidelidade visual ainda não foi medida. Próximos ensaios: dimensões/redimensionamento de painéis, hierarquia de foco, navegação de teclado, contraste, menus e estados de erro. Botão existente não prova equivalência.

## Bancos e agente

| Adaptador | Recorte | Estado |
|---|---|---|
| PostgreSQL | Testar conexão e listar schemas | Implementado no recorte; integração real testada |
| MySQL | Testar conexão e listar schemas | Implementado no recorte; integração real testada |
| MariaDB | Mesmo adaptador MySQL, perfil distinto | Ainda sem teste real |
| Oracle | Driver, service name/SID, schemas, TLS | Planejado |
| SQL Server | Driver, database/schema, autenticação, TLS | Planejado |
| Redis | SCAN paginado, tipos, TTL, limites, TLS | Planejado; não tratar como SQL |
| Codex | Handshake, autenticação, consulta/stream/interrupção | Handshake, streaming e conclusão aprovados; interrupção pendente |

Critérios futuros de banco: cancelamento, erros sem credenciais, paginação, reconexão, timeouts e fixtures por versão. Gravação de dados exige fluxo separado de transação/preview. Credenciais não devem ser inseridas no contexto do agente automaticamente.

## Evidência e diferenças

- `tests/workspace.test.ts`: gravação, conflito externo e escape de diretório/symlink.
- `tests/integration/php.test.ts`: servidor real resolve método via alias e trait e completa membros no buffer. `identity<T>` retornou null; teste registra a lacuna explicitamente, não conta como aprovação de inferência genérica.
- `scripts/check-databases.ts`: PostgreSQL 16 e MySQL 8.4, schemas e senha errada; containers isolados removidos.
- `scripts/check-agent.ts`: conta autenticada via protocolo instalado. Este teste não consome inferência. `scripts/check-agent-turn.ts` também confirmou streaming/conclusão com resposta curta no fixture; usa a conta e pode consumir limite.
- `scripts/check-ui.ts`: roteiro de Electron real. Executado com sucesso em macOS: F12 abriu User.php a partir de probe.php; nenhum erro do renderer. Screenshot local em `.artifacts/ide.png`.

Limites: falta resolver completion items para autoimport completo, classificação dos tipos de sugestões, cancelar LSP, exibir diagnósticos, tratar stubs externos, persistir layout, fechar abas, histórico de navegação, recuperação de buffers, seleção de keymap, testes Windows e desempenho em projetos grandes. `Find Usages` e `Go to Implementation` têm providers conectados, mas não são declarados validados. Índice inicial tem limite de espera de 90 segundos. Alterações externas atualizam o servidor, mas buffers abertos não são recarregados automaticamente; salvar detecta conflito.

## Milestones seguintes

1. Fechar oracles C01/C02 no PhpStorm autorizado; registrar build/keymap, resultado e diferenças. Resolver generics apenas com caso reproduzível.
2. C03/C04: conjuntos de referências/implementações, homônimos, herança, vendor e casos negativos; acrescentar métricas de índice frio/quente e alterações incrementais.
3. Ampliar UX com painéis redimensionáveis, histórico, fechar/reabrir abas e busca. Validar visualmente com tokens próprios.
4. MariaDB e próximo adaptador de banco, um por vez; ampliar agente com teste de streaming/cancelamento antes de aplicação de patches.

Fontes públicas: [Phpactor](https://phpactor.readthedocs.io/en/master/usage/standalone.html), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [bancos no PhpStorm](https://www.jetbrains.com/help/phpstorm/relational-databases.html), [Redis no DataGrip](https://www.jetbrains.com/help/datagrip/redis.html). A documentação de Redis é referência documental de produto relacionado, não observação do PhpStorm local.

## Verificação final

Typecheck e build aprovados; teste de arquivos aprovado; teste de linguagem real aprovado no recorte (com falha de generics explicitamente caracterizada); PostgreSQL/MySQL aprovados; handshake e resposta curta Codex aprovados. UI validada com F12 no macOS. Links Markdown locais conferidos. Grafo AST atualizado com graphify.

`npm audit` reportou zero vulnerabilidades após override de DOMPurify 3.4.17 (Monaco fixava 3.4.15). O build ainda avisa sobre bundle grande; otimização de carregamento e empacotamento ficam pendentes. Não foram medidos consumo de memória ou latência em projetos grandes.
