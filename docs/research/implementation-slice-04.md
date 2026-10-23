# Recorte 04 — fluxos de Git além do commit

21/10/2026. Pedido: ampliar a reprodução funcional de Git. Continuação do [recorte 03](implementation-slice-03.md). O código foi escrito a partir dos contratos, interfaces públicas do Git e documentação; não há código ou recursos extraídos do PhpStorm. A família continua **Em desenvolvimento**, sem validação comparativa integral.

## Comportamentos implementados

| Fluxo | Resultado implementado | Limite explícito |
|---|---|---|
| Staging parcial | Listar trechos reais do diff, preparar/retirar um trecho, manter o disco intacto e rejeitar revisão obsoleta | Arquivos de texto modificados; não divide linhas dentro de um trecho; inclusão/exclusão/rename/modo usam arquivo inteiro |
| Histórico | Commit → lista de arquivos → diff das versões; rename e commit raiz; ações cherry-pick/revert | Até 100 commits da branch atual, comparação com primeiro pai em merges; sem grafo/filtros |
| Branches | Listar locais/remotas, upstream e ahead/behind conhecidos; criar/trocar local; excluir branch integrada com `-d` | Sem checkout remoto/criação de tracking, renomeação, worktrees ou múltiplas raízes |
| Merge | Integrar branch local, exibir conflito e permitir abortar; commit com dois pais, inclusive resolução que mantém exatamente ours | Não tem editor gráfico de seleção por bloco |
| Rebase | Rebase sobre branch local; resolver conflito, continuar ou abortar | Sem rebase interativo; validação macOS somente |
| Conflitos | Grupo próprio, versões Git 2/3 somente leitura, resultado editável, base comum consultável; aceitar versão inteira ou editar; salvar e preparar | Conflitos textuais com ambos os lados presentes; exclusão/rename, symlink e submódulo recusados; marcadores devem ser removidos |
| Cherry-pick/revert | Aplicar commit ou criar commit inverso a partir do histórico, com revisão da operação | Conflitos desses sequenciadores ainda não têm controles próprios de continuar/abortar na UI |
| Stash | Guardar tracked + untracked; listar e reaplicar sem excluir a cópia | Sem drop/pop, comparação ou shelves próprias |
| Remoto | Fetch de remoto configurado, pull fast-forward, push explícito de HEAD para upstream da branch atual | Sem cadastro de remoto/credenciais, primeiro push sem upstream, force push ou pull com merge/rebase |

Operações são acionadas em diálogo que nomeia a ação/destino, mostra resultado/erro e impede fechamento enquanto o comando está em execução. Alterações não salvas impedem a execução. Checkout/merge/rebase/pull exigem diretório limpo; stash permite guardar antes de continuar. Não há limpeza forçada automática. O serviço reconcilia a UI mesmo após falhas, pois um merge pode retornar erro após escrever conflitos.

## Arquitetura

- `electron/git.ts`: métodos específicos, enum fechado de operações, validação de ref/hash/path, confirmação de HEAD e serialização das mutações do serviço. Git segue responsável pelos locks; não há garantia transacional contra outro cliente externo.
- `src/git-panel.ts`: navegação de histórico e staging parcial. Diff histórico não oferece ação de stage.
- `src/git-tools.ts`: seleção de operações/destinos e resolução textual em três colunas. O diálogo apresenta a semântica de ours/theirs durante rebase, em vez de assumir que ours sempre é a branch original do usuário.
- `main/preload/contracts`: IPC restrito. Operações que alteram o projeto recarregam a árvore e descartam modelos previamente salvos para evitar edição sobre conteúdo antigo; buffers não salvos bloqueiam o fluxo. Ainda não preserva a seleção/abas nessa atualização, diferença de UX registrada.

No staging parcial, o patch vem do próprio Git com `--no-ext-diff --no-textconv --unified=0`, passa por seleção de trecho, checagem e aplicação no index. O cliente não envia patch arbitrário. A operação reversa remove somente o trecho do index. Mudanças de modo são recusadas nesse perfil.

## Testes e achados

`tests/git-workflows.test.ts` usa repositórios reais descartáveis: seleção/reversão de trechos, revisão obsoleta, histórico raiz/rename, branches, impedimento de checkout sujo, stash com untracked, resolução/commit de merge com dois pais, remoção segura de branch, merge abort, cherry-pick, revert, rebase simples e rebase com conflito/abort/continue. Remoto **bare local**, com segundo clone, cobre fetch, push, pull e rejeição de divergência; nenhum push foi feito para serviço externo.

Achado reproduzido no Git 2.50.1 (Apple Git-155): propagar `GIT_LITERAL_PATHSPECS=1` para `stash push --include-untracked` guardava o arquivo novo mas o deixava no disco. Um ensaio mínimo com/sem a variável confirmou a diferença. O serviço agora aplica pathspec literal somente aos comandos diretos de caminho, preservando a semântica interna do stash. O teste exige árvore limpa após guardar e restauração do conteúdo ao aplicar.

Outro caso: resolver merge aceitando integralmente ours pode deixar o index idêntico a HEAD. A presença de MERGE_HEAD permite concluir o commit de merge mesmo sem diff de conteúdo; token inclui MERGE_HEAD. Esse caso tem teste positivo.

`scripts/check-git-workflows-ui.ts`: Electron real confirma seleção do segundo trecho preservando o primeiro, histórico → arquivo → diff somente leitura, criar/trocar branch, merge conflitante, conteúdo de cada lado, edição do resultado e commit de dois pais. Screenshots próprios: `.artifacts/git-history.png` e `.artifacts/git-conflicts.png`.

`tests/git.test.ts`, `tests/workspace.test.ts` e `scripts/check-git-ui.ts` mantêm a regressão do recorte anterior. Conferir o resultado final da execução antes de promover qualquer subcaso; nenhum desses testes executa o PhpStorm.

## Referência e evidência

- **OBS anterior:** Commit, Log e popup de branches registrados em [phpstorm-git.md](phpstorm-git.md).
- **OBS desta continuação:** `Show Git Log` abriu o painel; a linha acessível expôs `Initial fixture`, `IDE Fixture` e idade relativa. A seleção por AX não produziu lista de arquivos verificável. Não usar esse ensaio como aprovação de commit → diff na referência.
- **DOC:** [branches no PhpStorm](https://www.jetbrains.com/help/phpstorm/manage-branches.html) descreve criação a partir de branch/commit e widget; nossa versão cobre somente parte desses caminhos. [Conflitos](https://www.jetbrains.com/help/phpstorm/resolve-conflicts.html) descreve escolha de versões e resolução manual; o resultado editável orienta a especificação própria. Documentação 2026.2 não comprova comportamento do trial 2026.1.4.
- **API pública Git:** [diff-tree](https://git-scm.com/docs/git-diff-tree), [update-index](https://git-scm.com/docs/git-update-index); não há acesso a índices/componentes internos do PhpStorm.

## Equivalência ainda pendente

Não é uma cópia completa do controle Git do Storm. Faltam changelists e shelves, grafo/filtros/paginação do Log, seleção por linha e conflitos por bloco, editor com marcadores/blame/histórico por arquivo, amend, tags, reset/rollback, gestão de remotos/autenticação, worktrees, multi-root, submódulos e ensaios Windows. Também faltam cancelamento real de processos (há timeout de 30 s), tratamento explícito de resultado ambíguo após timeout, atalhos completos e comparação de foco/estados com a referência. Hooks e assinatura seguem configuração Git, sem matriz de validação própria.

A implementação usa staging explícito. Isso não equivale ao modo de changelists observado no Storm. A [matriz](../compatibility/phpstorm.md) preserva zero famílias integralmente validadas.

## Verificação final

Build e typecheck aprovados. A suíte de oito testes existente passou; o novo nono caso de conflito/abort/continue de rebase passou em execução direcionada. O teste ampliado de UI passou com seleção parcial, histórico, branches e resolução/commit de merge; a regressão básica de Git também passou após ajustar seu seletor para distinguir a confirmação de commit do novo diálogo de operações. O build ainda emite o aviso conhecido de bundle grande. Links locais conferidos e grafo AST atualizado.
