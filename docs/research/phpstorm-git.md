> Continuação: [recorte 03](implementation-slice-03.md) implementado e testado localmente; as observações abaixo preservam o estado da pesquisa anterior.

# Git — investigação e contrato de reprodução

Data: 21/10/2026. Família TOOL-GIT-001. O usuário solicitou equivalência do controle de Git e autorizou observar a interface do PhpStorm. Prioridade de produto: P1, preservando inteligência PHP como P0. Este documento não declara compatibilidade nem implementação de Git na IDE.

## Evidências e ambiente

- **OBS-GIT-01:** consulta pública de acessibilidade à janela `project – probe.php`, referência anteriormente identificada como PhpStorm 2026.1.4. A barra contém `VCS`; o menu inclui `Enable Version Control Integration…`, `VCS Operations Popup…`, `Apply Patch…`, `Get from Version Control…`, `Create Git Repository…` e ações de compartilhamento. Esse projeto não forneceu um ensaio de repositório Git ativo.
- **OBS-GIT-02:** abertura de repositório sintético com `open -a PhpStorm <fixture>` apresentou `Open Project`, opções `Cancel`, `Attach`, `New Window`, `This Window` e `Don't ask again`. Cliques AX em `New Window` e Enter não produziram transição verificável. Após a intervenção manual do usuário, a janela do fixture foi aberta e os ensaios abaixo prosseguiram.
- **OBS-GIT-03:** no fixture aberto, `VCS` passou a `Git`. Menu público: Commit, Push, Update Project, Pull, Fetch (desabilitado neste estado sem remoto), Merge, Rebase, Branches, New Branch, New Tag, Reset HEAD, New Worktree, Worktrees, Show Git Log, Patch, Uncommitted Changes, Selected Directory, Manage Remotes e Clone. Presença/habilitação não comprova execução.
- **OBS-GIT-04:** Git → Commit abriu `Commit Tool Window`. A árvore expôs `Changes 3 files checked`, com remove.txt, sample.php e staged.txt marcados; `Unversioned Files 1 file not checked`. Resumo visível `+1 *1 -1`. Há Refresh, Rollback, Show Diff, Shelve Silently, opções de visualização, Amend desmarcado, campo Commit Message vazio, Commit e Commit and Push. Isso é consistente com agrupamento de changelist; a configuração de staging não foi lida e permanece desconhecida.
- **OBS-GIT-05:** Git → Show Git Log abriu `Log Tool Window`. Árvore: HEAD (Current Branch), Local, main (current favorite branch), feature/pasta/example. Tabela Git log com uma linha, colunas Subject/Author/Date; filtros Branch/User/Date/Paths, busca com Regex/Match Case, Go To Hash/Branch/Tag, Refresh e Cherry-Pick. Há painel Changes e ação Show Diff; relação entre seleção de commit e conteúdo ainda não exercitada.
- **OBS-GIT-06:** Git → Branches abriu popup com Search e Branches Tree: Update Project, Commit, Push, New Branch, Checkout Tag or Revision, Local, main e feature. Não foi efetuado checkout.
- **OBS-GIT-07:** tentativa de selecionar sample.php e acionar Show Diff não produziu editor de diff verificável pela árvore consultada. A hierarquia AX mudou durante as ações; isso limita a automação, não demonstra defeito no PhpStorm. Nenhum commit/mutação foi feito pela UI.
- **DOC-GIT-01:** a documentação de [commit e push](https://www.jetbrains.com/help/phpstorm/commit-and-push-changes.html) distingue changelists de staging explícito, permite selecionar arquivos/trechos e comparar HEAD, index e versão local. Atalhos publicados não comprovam o keymap local.
- **DOC-GIT-02:** [Log](https://www.jetbrains.com/help/phpstorm/log-tab.html) organiza branches, commits, arquivos alterados e detalhes do commit. Buscar equivalência das relações seleção → conteúdo, não somente quatro painéis visuais.
- **DOC-GIT-03:** [configurações Git](https://www.jetbrains.com/help/phpstorm/settings-version-control-git.html) documentam staging e integração de atualização/remoto. Há divergência documental: a página de configurações diz que changelists são eliminadas ao habilitar staging; a de commit diz que são preservadas. Não fixar esse comportamento sem ensaio na versão local.

Documentação consultada identifica 2026.2; referência local 2026.1.4. Build/keymap ainda pendentes. Nenhum screenshot da referência capturado nesta etapa; nenhuma inspeção interna. Leitura de menus não valida suas ações.

## Fixture reproduzível

Executar `node scripts/create-git-reference.mjs` na raiz da IDE. O script cria exclusivamente um novo diretório temporário, identidade Git local fictícia e duas branches, sem remoto. Verifica o estado usando Git CLI; não abre a IDE automaticamente.

| Arquivo | Estado inicial | Finalidade |
|---|---|---|
| sample.php | Modificado, fora do index | Diff de texto Unicode |
| remove.txt | Removido no disco | Exclusão e recuperação |
| new.php | Não rastreado | Inclusão explícita |
| staged.txt | Adicionado ao index e modificado novamente no disco | Não confundir versão staged com local |
| .gitignore | Sem alteração | Não incluir arquivo limpo; ignorar .idea |

Branches `main` ativa e `feature/example`; um commit inicial. Conteúdo staged de staged.txt: `staged version\n`; no disco: `local version\n`. O primeiro ensaio manual utilizou `/private/var/folders/89/xpj9ty296m99tpwr19fvmxz80000gn/T/php-ide-git-reference-fs1xyn8b`, preparado antes da versão persistida do script. Não se exige hash de commit fixo (timestamps variam). Registrar hashes de arquivos, HEAD, build e configuração em cada execução comparativa.

## Roteiro de observação

1. Abrir fixture em nova janela e registrar confiança, branch, modo changelist/staging, keymap e estado de atualização.
2. Abrir Commit pelo menu; registrar agrupamento, cores, contagens, seleção inicial, arquivos ignorados e mensagens vazias. Não pressupor que checkboxes correspondam ao index.
3. Abrir diff de sample.php; registrar origem de cada lado, navegação entre trechos, foco, edição, fechamento e retorno ao arquivo.
4. Examinar staged.txt em HEAD/index/local; registrar separação das duas versões. Alternar staging somente em cópia descartável e capturar efeito sobre changelists.
5. Selecionar somente sample.php, informar mensagem e realizar commit local no fixture. Conferir árvore do commit, index e disco pelo Git CLI. Repetir cancelando; HEAD deve permanecer igual.
6. Abrir Log: selecionar commit → arquivos → diff; filtrar branch/texto, voltar e conferir seleção. Abrir seletor de branches; testar checkout com e sem alteração conflitante.
7. Em novas cópias: preparar conflito real entre branches, rename, binário, arquivo com espaços e nome iniciado por hífen; registrar mensagens e recuperação. Remoto apenas bare local para fetch/pull/push, ahead/behind e rejeição.

## Contratos preliminares próprios (REQ; oracle ainda pendente)

| Caso | Fluxo e critério de aceitação | Execução na referência |
|---|---|---|
| GIT-01 | Detectar repo/branch e distinguir modified, deleted, untracked e staged+unstaged; atualizar após alteração externa | Pendente |
| GIT-02 | Diff com fontes explícitas HEAD/index/disco; preservar Unicode e linhas; arquivo binário recebe tratamento explícito | Pendente |
| GIT-03 | Selecionar arquivo/trecho, stage/unstage, revisar exatamente o conteúdo a enviar ao commit; restante não se perde | Pendente |
| GIT-04 | Commit local com mensagem; erro de identidade/hook visível; cancelamento sem commit; conteúdo não selecionado preservado | Pendente |
| GIT-05 | Log relaciona commit, autor, data, branches, arquivos e diff; filtros e navegação mantêm contexto | Pendente |
| GIT-06 | Criar/trocar branch; conflito de checkout explicado, sem perda silenciosa | Pendente |
| GIT-07 | Merge com base/local/incoming explícitos; resolver e revisar resultado; abortar restaura estado previsto | Pendente |
| GIT-08 | Fetch/pull/push em remoto local: progresso, erro, ahead/behind e rejeição; não executar push automaticamente | Pendente |
| GIT-09 | Marcadores de alterações no editor; navegar trechos, visualizar versão anterior e rollback recuperável | Pendente |
| GIT-10 | Histórico do arquivo/blame e relação com Log; rename e caminhos com espaços | Pendente |
| GIT-11 | Stash/shelve, amend, cherry-pick, rebase e reset: especificar separadamente antes de implementar | Pendente |

Cada caso requer keyboard-only, foco/restauração, estado vazio, erro recuperável e atualização externa. A família não estará concluída com apenas status e botão Commit. Changelists e staging explícito são perfis diferentes; não apresentar um como equivalente automático ao outro.

## Plano de implementação independente

Primeiro recorte: GIT-01/02, lista de alterações ligada ao diff, fontes de comparação explícitas e atualização do estado. Depois GIT-03/04, com provas do conteúdo do commit e preservação de alterações não selecionadas. Em seguida Log/branches; conflito e remoto em fixtures próprias. Contratos finais dependem da observação acima.

Proposta: serviço Git no processo principal; subprocessos com argumentos separados, caminhos confinados, saída limitada e erros tipados; IPC restrito; parser de status delimitado por NUL; renderer para lista e diff Monaco. Separar operações de leitura das mutações, serializar mutações por repositório e reconciliar após ações externas. Definir suporte a worktrees, submódulos, múltiplas raízes, hooks e autenticação antes de anunciar esses perfis. Não transformar saída de erro em estado limpo.

Testes de integração usarão Git real em diretório temporário e compararão HEAD/index/disco antes/depois. Testes UI verificarão seleção → diff → revisão → resultado; screenshots próprios complementam, não substituem essas asserções. Testes comparativos repetirão o mesmo roteiro nas duas IDEs. Todas as comparações continuam pendentes.

## Verificação desta entrega

O gerador persistido executou com sucesso e conferiu os quatro estados esperados, branch main e conteúdo do index. Isso valida a preparação do fixture, não a compatibilidade. Git permanece sem implementação no produto; observações parciais não promovem a família inteira para Investigada. Não foram acionados recursos de IA presentes nos painéis da referência.

## Fidelidade Git 2026-11 — blame, changelists, linhas, Log, tags, reset e worktrees

Data: 03–04/11/2026. Plugin `phpforge.git` (repositório `plugin-git`, `main` local, sem push nem versão nova). Coordenação e release ficam com a sessão principal.

### Evidência observada (PhpStorm 2026.1.4, Islands Dark, keymap macOS)

Observação autorizada pelo usuário nesta sessão, num repositório temporário criado para isso (`/tmp/php-ide-git-obs-*`: commit de 01/10 e commits do dia, branch `feature/login` com merge `--no-ff`, tags `v1.0` leve e `v1.1` anotada, branch `feature/report` aberta em um segundo worktree, alteração local e arquivo não rastreado). Capturas locais em `.artifacts/phpstorm-reference/G-*.png` (não versionadas). Só leitura de UI; nenhuma ação executada no PhpStorm além de mover um arquivo de changelist no próprio fixture. Nada de código ou asset da JetBrains foi copiado.

- **OBS-GIT-20 (G-02, G-04):** gutter → menu com `Annotate with Git Blame`. A anotação ocupa uma coluna à esquerda dos números com `data autor`: `01/10/26 Fixture`, `Today Fixture` (data curta; autor = sobrenome). Fundo azul por commit, mais forte nos mais recentes; linha ainda não commitada fica sem anotação.
- **OBS-GIT-21 (G-05):** hover mostra `commit <hash completo>` (link), `Author: Nome <email>`, `Date: dd/mm/yy, HH:MM`, linha em branco e a mensagem; as linhas do mesmo commit ganham destaque.
- **OBS-GIT-22 (G-06..G-09):** menu da anotação: Close Annotations, Show Diff, View ›, Copy Revision Number, Annotate Revision, Annotate Previous Revision, Show in File History, Options ›. View: Revision, ✓Date, ✓Author, Commit number, Colors ›, Names › (Initials, ✓Last Name, First Name, Full Name, Email), ✓Show Diff On Hover. Options: ✓Ignore Whitespaces, Detect Movements Within File, Detect Movements Across Files, Show Commit Timestamp.
- **OBS-GIT-23 (G-10..G-13):** Commit em modo changelist: `Changes 1 file`, `Unversioned Files 7 files`. Menu do arquivo inclui `Move to Another Changelist… ⇧⌘M`, `Show Diff ⌘D`, `Jump to Source`, `New Changelist…`, `Edit Changelist… F2`. Diálogo `Move to Another Changelist`: Name (combo editável), Comment, `Set active`, `Track context`, Cancel/OK. Depois de mover para "Refactor": a lista ativa vazia "Changes" aparece em negrito sem contagem; "Refactor 1 file" em peso normal.
- **OBS-GIT-24 (G-14, G-15):** diff do Commit: `1 difference, 0 included`, caixa de seleção ao lado do número da linha do lado atual em cada trecho, título "Current version" com caixa. Menu: Revert, Append, Compare with Clipboard, Annotate with Git Blame, Move to Another Changelist…, `Include Selected Chunks into Commit`, `Exclude Selected Chunks from Commit`.
- **OBS-GIT-25 (G-16, G-17, G-21..G-24):** janela Git com abas Log, `Worktrees ×` (presente porque há dois worktrees) e `+`. Branches: `HEAD (Current Branch)`, Local (main com estrela, pasta `feature` › login/report), Tags (v1.0, v1.1). Grafo: linha principal teal, branch em roxo convergindo no merge, HEAD como anel; rótulos de ref à direita do assunto (branch atual, local, tag); autores próprios em negrito, merge esmaecido, fundo azul nos commits da branch atual. Filtros: `Text or hash` com `.*` e `Cc`, `Branch` (Select…, Favorites, HEAD, main, Local ›), `User` (Select…, me), `Date` (Select…, Last 24 hours, Last 7 days), `Paths`.
- **OBS-GIT-26 (G-18):** menu do commit: Copy Revision Number ⌥⇧⌘C, Create Patch…, Cherry-Pick | Checkout Revision, Show Repository at Revision, Compare with Local, (IA) | Reset Current Branch to Here…, Revert Commit, Undo Commit… | Edit Commit Message… F2, Fixup…, Squash Into…, Drop Commit, Interactively Rebase from Here…, Push All up to Here… | New Branch… ⌥⌘N, New Tag… | Go to Child Commit ←, Go to Parent Commit →.
- **OBS-GIT-27 (G-19):** `Git Reset`: `main -> 83f448f3 "Rename default user" by Ana Fixture`, texto "This will reset the current branch head to the selected commit, and update the working tree and the index according to the selected mode:", Soft/Mixed/Hard/Keep com descrições, **Mixed** marcado, Cancel/Reset.
- **OBS-GIT-28 (G-20):** `Create New Tag On <hash>` com "Enter the name of new tag", Cancel e OK desabilitado até haver texto.
- **OBS-GIT-29 (G-25, G-26):** aba Worktrees: ✓ no atual, nome em negrito, branch e caminho; barra +, excluir, atualizar, ajuda. `New Worktree`: From branch (Select branch), New branch (caixa + campo), Project name, Location (padrão: pasta-pai do projeto) e "The worktree will be created in: …", Cancel/Create Worktree.
- **DOC-GIT-10..16:** páginas públicas [investigate-changes](https://www.jetbrains.com/help/phpstorm/investigate-changes.html), [managing-changelists](https://www.jetbrains.com/help/phpstorm/managing-changelists.html), [commit-and-push-changes](https://www.jetbrains.com/help/phpstorm/commit-and-push-changes.html), [log-tab](https://www.jetbrains.com/help/phpstorm/log-tab.html), [use-tags](https://www.jetbrains.com/help/phpstorm/use-tags-to-mark-specific-commits.html), [undo-changes](https://www.jetbrains.com/help/phpstorm/undo-changes.html), [use-git-worktrees](https://www.jetbrains.com/help/phpstorm/use-git-worktrees.html) (documentam 2026.2): clique na anotação abre o commit no Log; Annotate Revision/Previous; ativa recebe mudanças novas; `Split Chunks and Include Selected Lines`; Git → New Tag com Tag name/Force/Commit/Message; push de tag único; Delete Worktree recusa principal e aberto; Prune; não aninhar worktree no projeto.

### Critérios de aceitação (requisito próprio a partir da evidência)

| Item | Critério |
|---|---|
| GIT-ANNOTATE-001 | Gutter → "Anotar com Git Blame"; coluna à esquerda dos números com data curta ("Hoje"/"Ontem") e sobrenome; linhas locais em branco; cor por idade; segue o buffer não salvo; hover com commit/autor/e-mail/data/mensagem e destaque das linhas do commit; clique abre o commit no Log; menu com os oito itens de OBS-GIT-22, View e Options persistidos; Options refaz o blame (-w, -M, -C); fechar restaura os números de linha |
| GIT-CHANGELIST-001 | Grupos por changelist, padrão "Changes" (exibida "Alterações"), ativa em negrito; mover com Nome/Comentário/Tornar ativa (lista existente ou nova); nova/editar (F2)/definir ativa/excluir; arrastar arquivo entre listas; mudanças novas vão para a ativa; lista excluída devolve arquivos para a ativa; ativa não pode ser excluída; metadados fora da árvore de trabalho |
| GIT-LINES-001 | Caixa por trecho ao lado do número do lado atual e por linha em trechos com várias linhas; contador "N diferenças, M incluídas"; menu Incluir/Excluir trechos selecionados e Dividir trechos e incluir linhas selecionadas; aplicar prepara só as linhas marcadas (ou retira, no diff HEAD → index) sem tocar o disco; diff alterado é recusado |
| GIT-LOG-002 | Grafo com linhas contínuas, convergência em merges, cores por linha, HEAD em anel; rótulos de refs; branches HEAD/Local por pasta/Remoto/Tags; filtros Branch, Usuário (inclui "eu"), Data (24 h, 7 dias, intervalo) e Caminhos aplicados pelo Git ao histórico inteiro; texto/hash com Regex e Cc; menu do commit na ordem de OBS-GIT-26 para as ações existentes; ← / → filho/pai |
| GIT-TAG-001 | Log → Nova tag… só com o nome (OK desabilitado vazio) e tag leve no commit; Git → Nova tag… com Nome, Forçar, Commit e Mensagem (vazia = leve); submenu "Tag X" no commit e menu no nó Tags com Checkout, Enviar para <remoto> e Excluir; nomes validados e tag existente só com Forçar |
| GIT-RESET-001 | Menu do commit → "Redefinir branch atual até aqui…" abre "Git Reset" com alvo, explicação e os quatro modos com descrições, Mixed marcado; Cancelar não executa; Hard/Keep e checkouts recusam buffers não salvos; editor, Commit e Log reconciliados também em falha |
| GIT-WORKTREE-001 | Aba Worktrees visível com mais de um worktree (ou pelo menu de abas); lista ✓/nome/branch/caminho/estado; Novo worktree com Da branch, Nova branch, Nome do projeto, Local e dica do destino; branch aberta em outro worktree força nova branch; não criar dentro do projeto; excluir recusa principal/aberto e worktree sujo; Prune |

### Implementação

- Nativo (`plugin-git/native/src`): `blame.rs` (`git blame --porcelain --contents -`, revisão com conteúdo, mensagens completas), `changelists.rs` (`<git-dir>/phpforge-changelists.json`, gravação atômica), `line_staging.rs` (reconstrói o blob do index a partir das linhas escolhidas; `hash-object -w` + `update-index --cacheinfo`; só modos 100644/100755), `log_filter.rs` (`--author`, `--since/--until`, `--grep` fixo/regex/ignore-case, pathspec literal, refs validadas, hash por prefixo), `tags.rs`, `reset.rs` (inclui checkout destacado) e `worktrees.rs` (`worktree list --porcelain -z`, add/remove/prune). `gitTools` passou a devolver `tags`, `worktrees` e `user`; `create-branch` aceita `startPoint`.
- Serviços novos: `gitBlame` e `gitChangelists`; `gitApplyHunk` aceita seleção `{trecho: true | [linhas]}`; `gitLog` aceita objeto de filtros; `gitOperation` ganhou `create-tag`, `delete-tag`, `push-tag`, `reset`, `checkout-revision`, `worktree-add`, `worktree-remove`, `worktree-prune`. O plugin também declara `workspace` (já liberado pelo host).
- **Rota nova no host (este worktree do php-ide):** `gitBlame` e `gitChangelists` em `src-tauri/src/tool_plugins.rs` e tipos em `shared/contracts.ts`. Sem essa liberação o host recusa o manifesto do plugin novo (serviço desconhecido); o release precisa levar as duas juntas e subir `minIdeVersion`.
- Interface (`plugin-git/src`): `git-blame.ts`, `git-menu.ts`, `git-changelists.ts`, `git-line-selection.ts`, `git-graph.ts`, `git-log-view.ts` (reescrito), `git-tags.ts`, `git-reset.ts`, `git-worktrees.ts`.

### Validação própria (não comparativa)

- `cargo test` em `plugin-git/native`: 31 testes, incluindo 8 cenários com Git real em repositórios temporários (blame de buffer/revisão/não rastreado/escape de caminho; changelists com ativa, exclusão e reconciliação; staging e unstaging por linha preservando o disco e recusando token velho; filtros do Log por branch, autor exato, datas, caminho, texto, Cc, regex e hash; tags leve/anotada/Force/nomes inválidos/exclusão; reset soft/mixed/keep/hard; worktrees de branch e nova branch, recusas, worktree sujo e Prune; branch e checkout a partir de commit).
- `npm test` no plugin: 12 testes (layout do grafo, rótulos de ref, datas, colunas e cores do blame, menu e fechamento, diálogo de changelist, payload de seleção de linhas, ciclo de vida e declarações de serviço).
- `GIT_PLUGIN_DIR=~/Projects/plugin-git node scripts/check-git-review-layout.mjs` (WebKit, mocks): 8 etapas aprovadas — revisão, blame, changelists, linhas, Log, tags, reset, worktrees. Capturas `.artifacts/git-blame.png`, `git-blame-menu.png`, `git-changelist-move.png`, `git-changelists.png`, `git-diff-lines.png`, `git-log.png`, `git-log-filters.png`, `git-tag-new.png`, `git-tag-dialog.png`, `git-reset.png`, `git-worktrees.png`, `git-worktree-new.png`.
- php-ide: `npm run typecheck` e `npm test` (41 testes Rust do host com a allowlist nova) aprovados.
- Não executado: `npm run test:native` com o plugin novo (o host só liga o crate pela revisão pinada em `Cargo.toml`, que esta sessão não podia alterar). Nenhuma comparação lado a lado foi feita; as famílias continuam **Em desenvolvimento**.

### Diferenças e limites conhecidos

- Blame: sem View → Colors, Show Diff On Hover, Hide Revision/Restore e link de issue; o Annotate Revision abre um editor somente leitura na área do editor (o host não oferece aba virtual a plugins). O link "Mostrar no histórico do arquivo" abre o Log filtrado pelo arquivo (não há janela File History).
- Changelists: o commit continua decidido pelo index (staging explícito); no PhpStorm em modo changelist, as caixas escolhem o que entra no commit sem index. Sem Track context, comentário levado à mensagem do commit e marcador vazado para listas não ativas.
- Linhas no diff: caixas sempre visíveis (no PhpStorm as de linha aparecem ao passar o mouse); "incluir" marca linhas para preparar/retirar, não para um commit parcial direto. Trechos de arquivos novos, removidos, binários ou com mudança de modo só aceitam o arquivo inteiro.
- Log: até 1000 commits por consulta; cores por coluna, não por branch persistente; sem Favorites, Go to Hash/Branch/Tag, ordenação, Show First Parent/No Merges e as ações de rebase interativo, Create Patch, Compare with Local, Undo Commit e Edit Commit Message.
- Tags: push de várias tags pelo diálogo de Push (Push tags: All/Current branch) não implementado.
- Worktrees: abrir outro worktree em janela nova precisa de rota do host; hoje o caminho é copiado com instrução. Sem Locked/Unlock e sem "New Worktree from <branch>" no painel de branches.
