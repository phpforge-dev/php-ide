# Docker integrado — Services em Rust/Tauri

2026-10-22. Requisito: integrar Docker à IDE com organização e fluxos próximos ao PhpStorm.

## Referência e evidência

Referência **documental**: [Docker no PhpStorm](https://www.jetbrains.com/help/phpstorm/docker.html), [Services](https://www.jetbrains.com/help/phpstorm/services-tool-window.html), [configuração de conexões](https://www.jetbrains.com/help/phpstorm/settings-docker.html) e [run configurations](https://www.jetbrains.com/help/phpstorm/docker-run-configurations.html). A referência oferece conexões, contextos, containers, imagens, Compose e outros recursos; isso não significa que todos estejam reproduzidos neste recorte.

Contratos públicos usados: [Docker CLI](https://docs.docker.com/reference/cli/docker/), [container ls](https://docs.docker.com/reference/cli/docker/container/ls), [formatação JSON](https://docs.docker.com/engine/cli/formatting/) e [Compose](https://docs.docker.com/reference/cli/docker/compose/).

Não houve extração de implementação ou assets proprietários nem observação da interface local do PhpStorm nesta rodada. O painel usa componentes, SVG e estilos próprios.

## Recorte funcional

**Services**, ícone Docker na lateral esquerda, ou Alt+8:

- Painel inferior com árvore de recursos à esquerda; detalhes/logs/Compose à direita. Redimensionamento por arraste ou teclado no separador.
- Seleção dos contextos existentes no Docker CLI. Nome e endpoint disponíveis na conexão; seleção lembrada localmente. Cada comando passa `--context`, sem alterar o contexto global do usuário.
- Conectar/atualizar, estado de conexão, erro de CLI ausente, engine indisponível e botão de tentar novamente.
- Containers com nome, imagem, estado e portas. Iniciar, parar, reiniciar e remover. Remoção exige confirmação, sem `--force` e sem remover volumes; container em execução deve ser parado primeiro.
- Imagens, volumes e redes listados, filtráveis e com detalhes de identificação. Download de imagem por referência explícita.
- Logs stdout/stderr, timestamps e últimas 200 linhas. Acompanhamento por consultas a cada 3 segundos enquanto o painel está visível; não é stream Docker contínuo. Streams stdout e stderr são apresentados em sequência; interleaving exato não é garantido.
- **Terminal** no container em execução: PTY nativo + xterm, `docker --context ... exec -it ... /bin/sh`. Sessão aparece com nome do container; entrada, resize e encerramento reutilizam o terminal existente.
- Compose detecta `compose.yaml`, `compose.yml`, `docker-compose.yaml` e `docker-compose.yml` na raiz. Mostrar serviços, `up -d`, `stop` e `build` usam o arquivo/contexto selecionados. Nenhuma aplicação Compose é iniciada automaticamente.
- Download e Compose recebem progresso stdout/stderr no renderer. **Interromper** cancela o cliente CLI da operação identificada; não promete rollback de alterações já feitas no engine. A interface atualiza os recursos ao concluir/cancelar.
- Ao trocar de projeto, limpa seleção e estado de Compose/terminal; o engine e containers permanecem externos à IDE e não são encerrados automaticamente.

## Arquitetura

`src/docker-panel.ts` implementa o painel e estados; `src/terminal-panel.ts` abre a sessão Docker sem concatenar shell. `src-tauri/src/docker.rs` consulta o CLI local com argv fixos, parseia JSON e oferece IPC restrito. `Backend.docker` pertence à aplicação; Compose e PTYs usam a raiz do projeto ativo.

Validações: contexto precisa existir na lista pública do CLI; IDs de containers são hexadecimais; imagem não aceita flags/espaços/comandos; arquivo Compose deve ser um dos nomes detectados e passar pelo confinamento de caminhos. Não há comando genérico de Docker, `prune`, remoção de imagens/volumes/redes ou remoção forçada de containers neste recorte.

Consultas têm limite de 8s, ciclo de vida de container 30s, download/Compose 180s; saída limitada a 1 MiB por stream. Ações mutáveis são serializadas. Progresso e cancelamento têm UUID próprio; o renderer não recebe PIDs. O comando de cancelar não espera o lock do projeto, permitindo interromper uma operação enquanto uma troca de projeto está pendente.

Não são exibidos ambientes/secrets de `docker inspect`, nem lidas credenciais do Docker pela IDE. Autenticação e TLS/SSH seguem a configuração do CLI. Logs de aplicações podem conter informações privadas: ficam na interface e não são enviados automaticamente ao agente ou persistidos por este painel.

## Testes e limitações de evidência

- Rust: argumentos inválidos, referências de imagens e descoberta de Compose; regressão do terminal via suíte nativa. Typecheck obrigatório.
- `scripts/fake-docker.mjs` simula o protocolo CLI somente em testes, selecionado por `PHP_IDE_DOCKER_BIN` **apenas quando o processo foi iniciado em modo smoke**. Não é backend Node da aplicação.
- Roteiro nativo: conectar, listar/selecionar container, iniciar/reiniciar/parar, ler stdout/stderr, abrir PTY/obter resposta, cancelar remoção, confirmar remoção, baixar imagem, progresso e cancelamento de download demorado, ler/iniciar/parar Compose, contexto offline e rejeitar flags/path externo.
- A suíte usa perfil, projeto, estado CLI e agentes sintéticos descartáveis. A camada UI/Tauri/Rust/processo/PTY é real; o engine Docker é simulado nesse roteiro. Não confundir com validação de daemon real.
- `.artifacts/docker-services-preview.png`: fixture visual no Chrome com transporte simulado, revisada visualmente; não screenshot do PhpStorm nem evidência de engine.
- Roteiro real preparado: `npm run test:native -- --no-db --docker-real`. Cria container sem rede/sem mounts e Compose com nome único usando `php:8.3-cli`; altera/remove somente esses recursos. Consulta os demais recursos sem alterá-los. Necessita engine iniciado e imagem disponível (o CLI pode precisar baixá-la). Cleanup usa contexto e nomes próprios do teste. Download/cancelamento de imagem são exercitados apenas pelo simulador.

A consulta inicial real encontrou `default` e `desktop-linux`, mas o engine não respondeu em 6s. Docker Desktop foi aberto, sem reiniciar/resetar o daemon nem alterar containers existentes. Foi solicitado ao usuário verificar o engine; teste real permanece pendente até ele responder.

## Compatibilidade e próximos recortes

Estado: **Em desenvolvimento** na equivalência ao PhpStorm. Recorte implementado; sem validação comparativa global.

| ID | Funcionalidade | Prioridade | Complexidade | Aceitação principal |
|---|---|---|---|---|
| DOCKER-CONNECT-001 | Contextos e conexão | Alta | Média | Contexto explícito; timeout recuperável; sem mudar contexto global |
| DOCKER-SERVICES-001 | Árvore e ciclo de vida | Alta | Média | Estado real retornado pelo CLI, ações no recurso selecionado, confirmação de remoção |
| DOCKER-LOGS-001 | Logs e acompanhamento | Alta | Média | stdout/stderr, limite e recuperação após erro/troca de seleção |
| DOCKER-EXEC-001 | Terminal no container | Alta | Média | PTY nativo, entrada/saída/resize/encerrar sem parar o container |
| DOCKER-COMPOSE-001 | Serviços, up/stop/build | Alta | Média | Arquivo/contexto explícitos, progresso e cancelamento sem promessa de rollback |
| DOCKER-IMAGES-001 | Imagens, pull, volumes/redes | Alta | Média | Listagem e pull; progresso e interrupção; sem prune/destruição global |

Dependências: Docker CLI + engine acessível; plugin Compose para Compose; `/bin/sh` na imagem para terminal. Não exige biblioteca Docker/Node em produção.

Diferenças conhecidas: sem criação visual de contextos/TCP/TLS, sem editar conexões SSH/TLS dentro da IDE, sem criação de container com formulário de mounts/env/portas, sem run configurations persistentes de Dockerfile, sem registry UI/push, sem seleção de shell para imagens sem sh/containers Windows, sem escala/down/recriação de Compose, sem integração de intérprete PHP/PHPUnit/Xdebug em container, sem upload/download de arquivos do container. Esses comportamentos exigem recortes e testes próprios; existência do painel não comprova equivalência.

## Verificação desta entrega

2026-10-22: typecheck aprovado, 10 testes Rust aprovados e 17 grupos de smoke no aplicativo Tauri empacotado aprovados (`.artifacts/native-packaged.json`, sem falhas). O grupo Docker exercitou também progresso e cancelamento, usando CLI sintética. Nova consulta ao engine local expirou após 6 segundos; execução com daemon real permanece pendente.

## Ícones de execução no gutter de arquivos Compose (2026-10-30)

Evidência separada:

- **Documentação (DOC):** a [ajuda de Docker Compose do PhpStorm](https://www.jetbrains.com/help/phpstorm/docker-compose.html) diz apenas que a IDE "adds gutter icons to run various services" definidos no arquivo Compose, que o Services (Alt+8) mostra os containers sob nós Compose e que Stop/Down ficam no nó Compose. A página não descreve posição exata, rótulos do menu nem a run configuration criada pelo gutter.
- **Observação do usuário (print do PhpStorm, não reproduzido localmente):** a linha `services:` tem ▶▶ verde; cada chave de serviço (`cache:`, `cache.read1:`) tem ▶ verde; os ícones ficam depois dos números de linha.
- **Requisito próprio:** clique no ícone abre um menu com Executar/Parar; Executar roda `docker compose --ansi never -f <arquivo> up -d` (tudo) ou `... up -d <serviço>`; Parar roda `stop` (tudo ou o serviço). A saída, o estado e os erros aparecem na aba Compose do Services e na barra de status. Não criamos run configuration persistente.

Implementação (plugin `docker-services`, `src/compose-gutter.ts`): decorações `glyphMarginClassName` (`compose-run`, `compose-run-all`) recalculadas ao trocar de modelo e ao editar (150 ms); clique tratado em `editor.onMouseDown` com `GUTTER_GLYPH_MARGIN`. A detecção usa o nome do arquivo (`compose*.y(a)ml`, `docker-compose*.y(a)ml`) e as chaves do primeiro nível de indentação sob `services:` no topo. O IPC existente `dockerCompose` ganhou um 5º argumento opcional `service`, aceito só com `up`/`stop` e validado no Rust (`[A-Za-z0-9][A-Za-z0-9._-]*`, sem flags); o arquivo pode estar em subpasta do projeto desde que siga o nome convencional, seja relativo, confinado e exista. Nenhum IPC novo.

Erros recuperáveis: CLI ausente (contextos falham, nenhum comando é executado, mensagem no Services e na status bar), daemon parado (o comando falha e a mensagem do Docker aparece), outra operação em andamento (aviso, sem enfileirar). O painel volta a ficar livre e permite repetir.

Validação: 6 testes do plugin (`tests/compose-gutter.test.mjs`: decorações nas linhas certas, arquivo não-Compose sem ícones, menu e argumentos de `up`/`stop` por serviço e total, CLI ausente, daemon parado, descarte do menu/listeners), 4 testes Rust do crate nativo (inclui validação de serviço e de arquivo em subpasta), harness Chromium com `main.ts`, `mountToolPlugins` e `editor-chrome` reais e IPC simulado (`.artifacts/compose-gutter-ok-full.png`). Janela Tauri real: `npm run test:native -- --no-db --extraction-only` aprovou o grupo Docker com CLI sintética, incluindo o novo passo (abrir `compose.yaml`, ▶▶ e ▶ presentes, clique no ▶ de `app` → menu → `up app` → container em execução); as 3 falhas da rodada (Web Vue/React, catálogo SQLite, aba de preview) são de outras áreas. A suíte padrão sem `--extraction-only` falha antes do Docker porque o perfil novo não concede `workbench` aos plugins. `scripts/fake-docker.mjs` cria `fixture-compose-<serviço>-1` quando recebe um serviço.

Limitações: sem Down, sem indicador de serviço em execução no ícone, sem run configuration persistente nem Debug; arquivos Compose com nome arbitrário (detectados por conteúdo) não ganham ícones; o menu não reproduz os rótulos exatos da referência; versão 1.0.2 (`bc95a57`) fixada em `default-plugins.json` e `src-tauri/Cargo.toml`. Se o plugin do depurador estiver ativo, o clique no gutter de qualquer arquivo do projeto, inclusive YAML, também alterna um breakpoint: isso é do plugin `php-debugger`, não deste recorte.

