# Git e Docker — organização dos painéis

## Referência e observações de 2026-10-22

Foram lidas as páginas oficiais [Git Log](https://www.jetbrains.com/help/phpstorm/log-tab.html), [Services](https://www.jetbrains.com/help/phpstorm/services-tool-window.html) e [Docker containers](https://www.jetbrains.com/help/phpstorm/docker-containers.html). As imagens públicas de Git Log e Docker Dashboard foram examinadas no navegador. Não houve controle da instalação nativa do PhpStorm, indisponível nesta sessão; não se trata de teste comparativo na aplicação licenciada.

Evidência visual documental: Git Log organiza branches à esquerda, tabela de commits ao centro e arquivos/detalhes à direita. Docker apresenta árvore hierárquica compacta de recursos e painel de conteúdo com abas, ações do container selecionado e indicador de estado. Documentação descreve filtro de containers parados e ações de contexto. Não foram copiados imagens, recursos proprietários ou código interno para o produto.

## Recorte implementado

| ID | Comportamento / aceitação | Dependências | Complexidade / prioridade | Estado |
|---|---|---|---|---|
| GIT-LOG-UI-002 | Git em dock inferior (Alt+9), branches à esquerda, tabela pesquisável e arquivos/detalhes separados; selecionar arquivo abre diff histórico | Git CLI, Monaco, gitHistory, gitLog | Média / alta | Implementada |
| GIT-LOG-FILTER-002 | Filtrar pelos refs locais/remotos existentes, HEAD ou todas as branches; buscar mensagem/autor/hash no conjunto carregado | Validação de refs no backend Rust | Média / alta | Implementada |
| GIT-COMMIT-UI-002 | Commit lateral separado (Alt+0), grupos recolhíveis, ícones de arquivo, estados e busca por caminho; preparação/revisão existentes preservadas | Git status/diff/index | Média / alta | Implementada |
| DOCKER-SERVICES-UI-002 | Árvore compacta com estado, seleção de recursos, expandir/recolher, filtro de parados, contagens e Dashboard com metadados disponíveis | Snapshot Docker | Média / alta | Implementada |
| DOCKER-ACTIONS-UI-002 | Toolbar de ícones próprios com tooltips e nomes acessíveis; menu de contexto de container reutiliza ações/habilitação; remoção mantém confirmação | Operações Docker existentes | Média / alta | Implementada |
| DOCKER-LOG-FILTER-002 | Busca local na saída de logs carregada; texto externo preservado; trocar contexto limpa dados antigos | dockerLogs | Baixa / alta | Implementada |
| UI-DOCK-002 | Git, Docker e terminal alternam no dock sem empilhar painéis; Git/Services redimensionam por ponteiro e teclado, altura persistida | tool-window.ts, localStorage | Média / alta | Implementada |

Git log traz até 100 commits e renderiza dados reais, sem desenhar um grafo fictício. Somente refs do repositório e o seletor controlado `--all` entram na consulta; argumentos arbitrários são rejeitados. Carregamentos de histórico/seleção possuem invalidação para evitar resultado obsoleto. Commit e sincronização continuam usando as proteções anteriores contra estado obsoleto/perda de alterações. Conteúdo de commit, nomes, logs e dados externos não são traduzidos.

## Testes

- Build/typecheck, 22 testes Rust e validação dos catálogos PT/EN. Teste Rust existente ampliado com isolamento do histórico entre branches e rejeição de argumento de opção.
- `scripts/check-tool-windows-ui.mjs`: 11 verificações com transporte simulado; busca, seleção de branch, arquivos/diff, seleção, filtros Docker, menu de contexto, exclusão mútua dos docks, temas e resize por teclado. Capturas `.artifacts/git-log-redesign-{dark,light}.png`, `git-commit-redesign.png`, `docker-dashboard-redesign-dark.png` e `docker-logs-redesign-{dark,light}.png`.
- Roteiro nativo ampliado com grupo de Git UI e verificações de filtro de parados, menu e busca nos logs Docker. `node scripts/check-native.mjs --packaged --no-db` aprovou os 21 grupos no pacote Tauri final, incluindo o novo Git UI e as verificações Docker. O runner usa repositórios descartáveis e CLI Docker sintético, salvo execução explícita com engine real; esta execução não valida engine Docker ou bancos reais.

## Limites de equivalência

Compatibilidade com PhpStorm **Em desenvolvimento**. Sem comparação pixel a pixel ou teste observacional nativo nesta sessão. Git: sem grafo de commits, paginação além de 100, filtros por data/caminho, log multi-root ou todas as operações de contexto. Busca de commits atua nos 100 carregados. Docker: sem edição de variáveis/mounts, filesystem, processos, registries ou recriação de container pelo Dashboard; apenas dados disponíveis no snapshot atual. Os painéis não sugerem essas funções como existentes. Logs são os últimos 200 registros e atualização periódica, sem streaming ilimitado. Divisões internas têm larguras responsivas; arraste disponível apenas na altura do dock. Testes próprios aprovados não validam equivalência integral.
