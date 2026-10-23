# Recorte 21 — Depurador Xdebug (TOOL-XDEBUG-001)

23/10/2026. Pedido: depurar programas PHP com Xdebug 3 pelo protocolo DBGp. O escopo cobre escutar numa porta, breakpoints de linha e condicionais, passos, pilha, variáveis com paginação, eval, mapeamento de caminhos servidor ↔ local (inclusive Docker), "Debug script" com o `php` local e erros recuperáveis.

## Separação de evidências

- **Documentação (DOC):** a especificação pública do DBGp (xdebug.org/docs/dbgp) define o enquadramento `<tamanho>\0<xml>\0`, os comandos `cmd -i tx [-x valor] [-- base64]`, `init`, `feature_set`, `breakpoint_set/remove` (tipos `line` e `conditional`), `run`/`step_*`/`stop`/`detach`, `stack_get`, `context_names/get`, `property_get` com `-p` (página), `eval`, `stdout` e as notificações `breakpoint_resolved`. A documentação do Xdebug 3 define `xdebug.mode=debug`, `start_with_request`, `client_host`/`client_port` (padrão 9003), `idekey` e o gatilho `XDEBUG_SESSION`. As duas fontes não foram relidas nesta sessão: o código partiu do conhecimento da especificação e foi validado contra o Xdebug 3.4.5 real (ver Verificação).
- **Observação do PhpStorm (OBS):** nenhuma. Nada foi comparado visualmente ou por comportamento com a referência.
- **Requisito próprio (REQ):** atalhos F7 (entrar), F8 (passar por cima), Shift+F8 (sair), F9 (continuar), Cmd/Ctrl+F8 (alternar breakpoint), Cmd+Shift+F8 (lista de breakpoints), Cmd+F2 (parar) e Alt+5 (painel), conforme o pedido. O padrão é escutar só em 127.0.0.1, e "todas as interfaces" exige opção explícita. Breakpoints, watches e mapeamentos são guardados por projeto em `localStorage` (`php-ide-debug:<raiz>`), nunca no repositório. Sem credenciais envolvidas.
- **Hipótese:** que esses atalhos e o layout (frames | variáveis + watches | console/breakpoints/mapeamentos) correspondam ao keymap e à janela Debug da referência. Não foi observado.

## Implementação

Backend `src-tauri/src/debug.rs` (novo):
- Parser XML mínimo para as respostas DBGp (atributos com prefixo, CDATA, entidades, aninhamento limitado a 256 níveis), base64 próprio, leitura de pacotes enquadrados (limite de 64 MB) e montagem de comandos com aspas e escape. NUL e quebras de linha são recusados nos argumentos.
- `Debugger` global, fora do projeto, com listener TCP (`127.0.0.1` ou `0.0.0.0`) e várias sessões simultâneas (`s1`, `s2`…). Cada sessão tem um leitor próprio, transações pendentes por `transaction_id` e timeout de 30 s nos comandos de consulta.
- Fluxo da sessão: `init` → `feature_set` (max_depth 1, max_children 100, max_data 8192, notify_ok, resolved_breakpoints) → `stdout -c 1` (copia a saída, exceto nas execuções do próprio "Debug script", que já capturam stdout/stderr) → sincronização de breakpoints → `run` (ou `step_into` com "Parar na primeira linha").
- As continuações (`run`/`step_*`) respondem só quando o script para. Por isso são aguardadas em segundo plano e o resultado chega por evento `debug-event` (`session`, `running`, `break` com frames mapeados, `stopping`, `ended`, `output`, `notify`, `exit`, `error`). Em `stopping`, o IDE manda `stop`. Fora de `break`, o IDE fecha a conexão sozinho, porque a conexão via proxy do Docker Desktop não fecha depois de `stop`.
- Breakpoints: o backend compara a lista desejada com a lista já enviada à sessão (chave uri+linha+condição). A sincronização roda ao configurar, em cada `break` e logo após mudanças com a sessão pausada. Condição vira `-t conditional -- base64`.
- Mapeamento: prefixo mais longo, casado por componente de caminho (`/app` não casa com `/application`). Local → servidor para breakpoints; servidor → local para frames, com confinamento ao projeto e verificação de que o arquivo existe. Sem mapeamento, o mesmo caminho no disco é usado (PHP local). Frame sem caminho local aparece como `local: null`.
- "Debug script": exige escuta ativa e arquivo `.php` do projeto (`confined`). Verifica o Xdebug 3 com `php -r` antes de rodar, depois executa `php -dxdebug.mode=debug -dxdebug.start_with_request=yes -dxdebug.client_host=127.0.0.1 -dxdebug.client_port=<porta> -dxdebug.idekey=phpide-run-N <arquivo>` com `XDEBUG_SESSION`, sem shell, na raiz do projeto e com `kill_on_drop`. O binário vem de `PHP_IDE_PHP_BIN` ou do `php` no PATH.
- IPC restrito: `debugStatus`, `debugListen(porta 1024–65535, todas)`, `debugUnlisten`, `debugConfig(breakpoints ≤5000, mapeamentos ≤100, breakFirst)`, `debugRun`, `debugRunStop`, `debugContinue` (lista fechada: run, step_into, step_over, step_out, stop, detach), `debugStack`, `debugContexts`, `debugVariables`, `debugProperty`, `debugEval` (≤20 000 caracteres). As consultas são recusadas fora de `break`.
- Erros recuperáveis: porta ocupada ("A porta N já está em uso…"), Xdebug ausente no PHP local, conexão sem `init` (ignorada com aviso), conexão caída (pendências falham com "Conexão com o Xdebug encerrada", sessão removida, evento `ended`), mapeamento inválido, comando fora de pausa.

Registro: `mod debug`, campo `debug` no `Backend` e rota `debug*` em `src-tauri/src/main.rs` (inserções pequenas).

Frontend `src/debug-panel.ts` + `src/debug-panel.css` (novos), montado em `src/main.ts` (import, `mountDebugger` e `debugPanel.reset()` na troca de projeto):
- A margem de glifos do Monaco fica ligada. Clicar nela alterna o breakpoint. Marcas próprias: círculo, quadrado para condicional, contorno para desativado. Os breakpoints acompanham edições (decoração "grudada"; linha atualizada e deduplicada).
- A linha atual fica destacada com seta na margem. O frame selecionado fora do topo tem destaque secundário.
- Painel Depurar na barra lateral esquerda (Alt+5), com o estado no ícone (escutando/executando/pausado). Barra com Escutar/porta, Depurar script, ▶ ↷ ↘ ↗ ■, seletor de sessão e estado textual.
- Frames clicáveis. Frame sem mapeamento ganha "Mapear caminho…", que abre Mapeamentos com a pasta do servidor preenchida. Ao adicionar o mapeamento, a pilha é recarregada.
- Variáveis em árvore por contexto (Locais/Superglobais/Constantes). Filhos são carregados sob demanda e paginados ("Mostrar mais (N restantes)"). Watches persistidos aparecem no topo da árvore e são reavaliados a cada pausa; a expansão usa `property_get` com a expressão.
- Console com saída do script (stdout/stderr), eventos e eval no frame atual. Aba Breakpoints com ativar/desativar, condição editável, ir para a linha e remover. Aba Mapeamentos com adição/remoção e a opção "todas as interfaces".
- Strings em pt-BR com traduções em `src/locales/en.json`.

## Verificação

- `cargo test debug::` (unitários, em `npm test`): parser de `init`/`response`/erros/entidades/propriedades com base64, classe e facet; comandos com aspas e base64; pacotes enquadrados, inclusive terminador ausente; mapeamento Docker, prefixo mais longo, raiz `/`, sem mapeamento, fora do projeto; URIs com espaço/`#`/Windows. Também um motor DBGp falso via socket real: porta ocupada; sessão com breakpoint, stream de stdout, break, frame mapeado e frame sem mapeamento, variáveis, eval, ação desconhecida recusada, stop, `ended` e consulta após o fim recusada.
- `node scripts/check-xdebug.mjs` (novo): constrói a imagem descartável `php-ide-xdebug-test:8.3` (php:8.3-cli + pecl xdebug 3.4.5) e roda `debug::integration` com containers `--rm`. Resultado: **2/2 aprovados** com Xdebug 3.4.5 real, escutando só em 127.0.0.1 (Docker Desktop no macOS).
  - Container com `/app` mapeado: breakpoint de linha, contextos, 250 itens paginados em 100/100/50, `$user['tags']` por `property_get`, eval e eval inválido (erro), consultas recusadas durante a execução, condicional `$i == 7`, troca de breakpoints com a sessão pausada, step_into/over/out, variáveis do frame 1 e saída "Olá, Ana" via `stdout`.
  - "Debug script" por wrapper que executa o mesmo caminho no container: recusa sem escuta, recusa de `../`, idekey ligado à execução, parada na primeira linha, breakpoint, stop, `ended` e `exit`.
- `node scripts/check-debug-ui.mjs` (novo; Vite + Chrome headless, Monaco real, IPC e eventos Tauri simulados, porta livre escolhida na hora): **26 verificações aprovadas**: gutter, Cmd+F8, persistência, Alt+5, Escutar 9003, linha atual, frames, estado, árvore, paginação, watch, console, F7/F8/Shift+F8/F9, sugestão e envio de mapeamento, remapeamento, limpeza no fim e porta ocupada visível. Captura em `.artifacts/debug-panel-preview.png`.
- `npm run typecheck`, `npm run test:locales` e `npm test` (62 aprovados, 5 ignorados) passaram. `npm run test:native`, rodado uma vez no fim com a máquina carregada por outras sessões (que também rodavam `check-native`), terminou em "Native smoke timeout" após 180 s, sem nenhuma falha de check reportada. O primeiro disparo nem iniciou porque o Vite de outra sessão ocupava a porta 1420. Não foi repetido, para não concorrer com as outras sessões. O smoke nativo compartilhado também não exercita o depurador, porque `src/native-smoke.ts` não é deste recorte. Por isso a janela Tauri com o painel de depuração **não foi validada** neste recorte; a validação de UI é a do Chrome headless acima.

## Limites

- Sem comparação com o PhpStorm; nada promovido a compatível.
- Sem pausa assíncrona (`break`) durante a execução, breakpoints de exceção, de função ou de chamada, hit count, set value, "Run to cursor", "Evaluate" em frame diferente do topo (o `eval` do DBGp roda no frame atual), filtros de sessão por idekey, validação de "Zero-configuration" e proxy DBGp.
- "Debug script" usa só o `php` local. Depurar CLI dentro de container exige iniciar o PHP por conta própria, com `xdebug.client_host` apontando para o host e mapeamento configurado. No Linux, `host.docker.internal` precisa de `--add-host=host.docker.internal:host-gateway` e, conforme a rede, da opção "todas as interfaces".
- Breakpoints de arquivos não abertos não acompanham edições feitas fora do editor.
- O estado dos breakpoints de cada sessão (resolvido/movido) aparece só no console, não na margem.
- Testado só com Xdebug 3.4.5 / PHP 8.3 no macOS + Docker Desktop.

## Proposta para catálogo/matriz

- **TOOL-XDEBUG-001:** Estado → *Em desenvolvimento* — escuta DBGp, breakpoints de linha e condicionais na margem, passos, pilha, variáveis paginadas, watches/eval, console, mapeamento servidor ↔ local (Docker) e "Debug script" local. Evidência da implementação: [recorte 21](implementation-slice-21.md), `scripts/check-xdebug.mjs` (Xdebug 3.4.5 real) e `scripts/check-debug-ui.mjs`. Comportamento observado: não caracterizado na referência. Diferenças conhecidas: ver Limites deste recorte (sem pausa assíncrona, sem breakpoints de exceção, atalhos tratados como hipótese).
- **Matriz:** nenhuma linha promovida. A validação foi só contra o Xdebug, não contra o PhpStorm.
