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
