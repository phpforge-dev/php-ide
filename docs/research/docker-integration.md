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


## Compose: Down, estado de execução e run configurations (2026-11-04)

Plugin `docker-services` (local, sem push nem bump, versão 1.0.2 inalterada): commits `c5a1eb4` (Down), `fe39bad` (estado), `5d2ed5f` (run configurations), `9dbaa4b` (números de linha × depurador) e `bca9076` (alinhamento com a observação abaixo). Host php-ide: seletor de run configurations no widget Run (`src/run-configurations.ts`) e harness `scripts/check-docker-compose-ui.mjs`.

### Evidência

- **Documentação (DOC):** [Docker Compose](https://www.jetbrains.com/help/phpstorm/docker-compose.html): Down fica no nó Compose do Services e "para e remove containers, redes, volumes e imagens"; o estado de cada serviço aparece como **inlay de status** ao lado do nome do serviço no arquivo (rodando ou falhou) e o clique abre os logs no Services; a run configuration Docker Compose é criada em Edit Configurations, aparece na barra principal e roda com Run (⇧F10). [Run configuration Docker Compose](https://www.jetbrains.com/help/phpstorm/docker-compose-run-configuration.html): Name, Store as project file, Server, Compose files (`-f`), Services e Modify options (Specify project name `-p`, Remove orphans/volumes/images on `down`, Build missing/never/always, Recreate containers changed/all/none, Remove orphans, Attach to, entre outras).
- **Observação local (OBS, 04/11/2026, PhpStorm 2026.1.4, Islands Dark):** fixture própria descartável (`redis:6-alpine` com `sh`, projeto `phpide-obs-compose`), aberta como arquivo avulso na janela do usuário; capturas em `.artifacts/phpstorm-reference/docker-compose/` (00–15). Visto: ícones do gutter são triângulos **vazados** (▷▷ em `services:`, ▷ por serviço), depois do número; o clique **executa direto**, sem menu, e cria uma configuração temporária `compose-obs/compose.yaml.cache: Compose Deployment` (serviço) ou `compose-obs/compose.yaml: Compose Deployment` (arquivo), selecionada no topo; clique direito não abriu menu. A configuração vem com **Remove orphans on `down`** ligado e **Attach to: None**; Services vazio mostra "Leave empty to run all services". O ícone **não muda** com o serviço rodando; nenhum inlay de status apareceu (arquivo fora do projeto: o inlay documentado não foi confirmado). Services: nó `Docker-compose: <projeto>` (ícone com marca verde quando roda), filhos por serviço com marca verde/cinza, detalhe `Running: (n/m)` com Start All (quando nem todos rodam), Restart, Stop e **Down**, que roda **sem diálogo** e remove o nó. Popup do seletor: configurações (a selecionada com ▷ e ⋮), Current File, Edit Configurations…; diálogo Run/Debug Configurations com grupo Docker, Name, Allow multiple instances, Store as project file, Server, Compose files, Modify options, Services, Attach to, Before launch e o botão de salvar temporária. As duas configurações temporárias foram removidas e a seleção do usuário ("backend") restaurada; containers e rede da fixture removidos.
- **Requisito próprio:** o Down roda direto como na referência, com "Remover volumes/órfãos no down" da configuração do arquivo; quando a configuração remove volumes, pede confirmação ("Down e remover volumes") porque apaga dados. Remover imagens (`--rmi`) não foi implementado. O inlay de status segue a documentação, não foi visto na observação.

### Critérios

1. Down roda `docker compose -f <arquivo> down` na hora, com `--volumes`/`--remove-orphans`/`-p` da configuração do arquivo, só com essas opções (nativo rejeita qualquer outra); com volumes, confirmação que pode ser cancelada; falha do daemon aparece e o painel volta a ficar livre.
2. Estado: `docker compose ps --all --format json` (linhas JSON e o formato antigo em array) ao abrir o arquivo, depois de cada operação e a cada 5 s com o arquivo ativo e a janela visível. O ícone ▷ não muda; serviço rodando: inlay `running`/`running N/M`; parado: `exited (0)`; falhou (saída ≠ 0, dead): inlay vermelho. Sem container: sem inlay. Clique no inlay abre os logs do container no Services. CLI/engine ausentes só removem o indicador, sem mensagens repetidas. Services agrupa containers em `Docker-compose: <projeto>` (rótulos `com.docker.compose.*`), com marca no grupo quando algo roda; a aba Compose mostra `Running: (n/m)` do arquivo.
3. Run configurations: campos acima (sem Attach, Profiles, env files, scale, timeouts), guardadas por projeto (chave pela raiz do workspace, no perfil local, como o workspace file da referência; não há "Store as project file"). Clique no ▷ (sem menu) cria/reusa a configuração temporária `<pasta>/<arquivo>[.<serviço>]: Compose Deployment` com órfãos no down, seleciona e executa; no máximo 5 temporárias. Diálogo com +, −, copiar, Aplicar/OK, validação (nome, arquivos Compose do projeto, serviços existentes nos arquivos, nome de projeto). O seletor do topo lista as configurações com ícone, "Arquivo atual", "Salvar a configuração" para temporária e "Editar configurações…"; ▶ do topo executa a selecionada. Down e o `ps` usam o `-p` da configuração do arquivo.
4. Gutter compartilhado com o depurador: clique no ícone do Compose abre só o menu do Compose. Em arquivos Compose (sem breakpoints de linha), clique/clique direito no número de linha não cria breakpoint nem abre o menu de breakpoint, e o número continua selecionando a linha (⇧ estende); o ponto de hover do breakpoint não aparece. Em PHP o número continua com o depurador.

### Contrato de host: `runConfigurations:<tipo>`

Plugins publicam um tipo de configuração com `sdk.provide('runConfigurations:<tipo>', provider)`; `provider = {type, label, icon (SVG), list(): {id,name,temporary?,description?}[], run(id), edit(id?), save?(id), select?(id|undefined), selected?(), onChange(fn(select?))}`. O host (`src/run-configurations.ts`, montado pelo widget Run de `src/workbench.ts`) descobre os serviços com `pluginServicesWithPrefix` e o evento `ide-plugin-service`, lista todos os tipos num único popup e não guarda seleção: cada provider guarda a sua por projeto e o host consulta `selected()`. `onChange(id)` pede ao host para selecionar uma configuração (gutter). **Limitação:** o plugin `php-tests` 1.1.0 esconde `.run-config`/`#run-current` e monta o próprio seletor; enquanto ele estiver ativo, o seletor do host (e as configurações Docker) ficam ocultos. A migração do `php-tests` para o contrato foi proposta à sessão php-tests-2 e é pendência.

### Depurador e gutter (item 4)

Reproduzido no harness WebKit: com o `php-debugger` 1.0.0 o clique no ▶ do Compose cria breakpoint (o depurador tratava qualquer clique na margem de ícones); com o 1.1.0 fixado o ícone não cria, mas o clique no **número** de qualquer linha de YAML cria. Correção do lado do Compose: em arquivos Compose o plugin intercepta pointer/mouse/contextmenu no número de linha em captura no `document` (antes dos ouvintes do container do editor), reproduz a seleção de linha do editor e marca o container com `compose-file` para esconder o hover do breakpoint. Outros YAML/JSON/etc. continuam recebendo breakpoints: a correção geral (breakpoint de linha só em modelos PHP, por exemplo `model.getLanguageId()==='php'`) pertence ao `php-debugger` e fica como pendência.

### Validação

- Plugin: 17 testes `node:test` (Down, estado, inlay → logs, grupo Compose, run configurations, persistência, contexto inexistente, números de linha × ouvinte de depurador) e 7 testes Rust do crate (`compose_argv`, `compose_ps`, rótulos, `-p`, rejeição de flags).
- Harness WebKit no app real (main.ts, editor chrome, tool plugins, widget Run) com IPC simulado, Docker local e depurador 1.1.0 fixado: `node scripts/check-docker-compose-ui.mjs` → 27 verificações, capturas em `.artifacts/docker-compose-fidelity/`. Com `PHP_IDE_DEBUGGER_PLUGIN=<1.0.0>` falha em "clique no ícone do Compose não cria breakpoint", como esperado.
- `scripts/fake-docker.mjs` aceita `ps`, `down`, `-p` e flags do `up` para o `test:native`. O host usa só `Docker::default`, `dispatch`, `cancel`, `shutdown`, `resume`, `executable`, `validate_context` e `container_id`, sem mudança de assinatura (o crate só ganhou `compose_argv`, `compose_ps` e `compose_project`); `cargo check` do host com o crate local via `--config patch` não chegou a compilar o app porque o build script exige `.tools/phpactor.phar.patch.json`, ausente neste worktree. `npm run test:native` não foi executado: depende da fixação do crate e do plugin pela coordenação.

Limitações: observação feita com o arquivo fora do projeto (inlay não confirmado; Stop/Down por serviço e Start All/Restart do nó não implementados); sem `--rmi`, Attach (sempre `-d`), Profiles, env files, scale, timeout, Before launch, "Store as project file" e Debug; o estado é por consulta (5 s), não por eventos do engine; arquivos Compose com nome fora da convenção continuam sem ícones; o seletor do host fica oculto com o `php-tests` 1.1.0 ativo.
