# Fatia 27 — Cobertura Rust/Tauri de Git avançado, remotos SSH/HTTPS, mudanças concorrentes e matriz de bancos

Objetivo: substituir, no harness Rust/Tauri, a cobertura que só existia nos testes Electron históricos para merge/rebase, mudanças concorrentes de arquivos do projeto, perfis SSH/HTTPS contra remotos reais e versões de bancos (ver `docs/research/tauri-migration.md`). Os testes são casos próprios; **não** comprovam compatibilidade com o PhpStorm.

## Separação de fontes

- **Evidência documental**: comportamento do Git conforme a documentação pública (`git merge --abort`, `git rebase --continue/--abort`, `git cherry-pick --abort`, `git revert --abort`, `git stash apply --index`, `git checkout --ours/--theirs`, `git-http-backend`, `git-shell`). Comportamentos observados nos testes vêm do Git 2.50.1 (Apple Git-155) do host e do Git do Alpine 3.20 no servidor.
- **Requisito próprio**: abortar qualquer operação em andamento pela IDE; aceitar um lado inteiro mesmo para conflitos de exclusão/binários; buffers abertos refletirem mudanças externas sem perder edições; nenhum prompt bloqueante de senha/host key; nenhuma senha em arquivo.
- **Hipótese**: rótulo `conflict` para conflitos sem estado de operação (na prática, `stash apply`). Não há marcador no `.git` que comprove a origem.
- Nenhuma observação nova do PhpStorm foi feita nesta fatia; nada aqui foi promovido a compatível.

## O que foi implementado/corrigido

Backend (`src-tauri/src/git.rs`):
- `gitStatus` passa a expor `operation`: `merge` | `rebase` | `cherry-pick` | `revert` | `conflict` | `null`, lido de `rebase-merge`/`rebase-apply`, `MERGE_HEAD`, `CHERRY_PICK_HEAD` e `REVERT_HEAD`. `gitConflict` usa a mesma fonte (antes procurava só `*_HEAD` e rotulava todo o resto como merge com "incoming").
- **Bug corrigido**: cherry-pick e revert com conflito não tinham como ser abortados pela IDE (`merge --abort` falha nesses estados). Novas operações `cherry-pick-abort` e `revert-abort`.
- **Bug corrigido**: conflitos modify/delete e binários não tinham saída na IDE — o merge editor recusa ("Conflito de exclusão exige resolução externa"/"Conflito não textual") e "Aceitar a minha/deles" chamava o mesmo `gitConflict`, falhando igual. Novo `gitResolveSide(path, 'ours'|'theirs', indexToken)`: `checkout --ours/--theirs` + `add` se o lado existe, `rm` se o lado excluiu. Usa pathspec `:(literal)` porque `process.rs` não define `GIT_LITERAL_PATHSPECS` para `checkout` (teste com `bin*.dat` ao lado de `bin1.dat`).

Frontend:
- `src/git-panel.ts`: botão de abortar segue `operation` (merge, rebase, cherry-pick ou revert); antes só aparecia em merge.
- `src/git-tools.ts`: rótulos de `cherry-pick-abort`/`revert-abort`.
- `src/merge-editor.ts`: "Aceitar a minha/deles" usa `gitResolveSide`.
- `shared/contracts.ts`: inserções pequenas (`operation`, novos kinds, `gitResolveSide`). `src/locales/en.json`: duas strings.
- **Bug corrigido (arquivo aberto alterado externamente)**: o watcher emitia `project-changed`, mas nenhum buffer aberto era atualizado; `open()` de arquivo já aberto não relê o disco; um buffer editado não podia ser salvo (etag) nem fechado (sujo) — sem saída. Novos `src/file-sync-core.ts` (lógica sem DOM) e `src/workspace-sync.ts` (liga `ide-workspace-file-changed` aos buffers): buffer limpo recarrega; buffer editado nunca é sobrescrito e recebe aviso único por versão do disco; arquivo removido/renomeado é avisado; ação do editor "Recarregar arquivo do disco (descarta edições)" (paleta F1) resolve o impasse. Ligado em `src/main.ts` com duas linhas.
- `src-tauri/src/workspace.rs`: filtro do watcher extraído para `workspace::watched` (usado em `main.rs`, edição pequena) e passa a ignorar o temporário `.php-ide-*` do salvamento atômico.

## Testes adicionados

Rust (`npm test`), `src-tauri/src/git_scenarios.rs` (módulo de teste incluído por `git.rs`), cada um em repositório temporário:
- merge sem conflito (commit com dois pais, merge repetido é no-op);
- merge com conflito: bloqueio de commit/rebase/diff, base/ours/theirs, recusa de marcadores, token invalidado por alteração externa, resolução + commit de merge; merge-abort restaura HEAD/árvore;
- rebase com conflito → resolver → `rebase-continue` (segundo commit aplica, branch volta a `feature`, histórico linear); `rebase-abort` após resolução parcial; `rebase-continue` sem resolver é recusado e mantém o rebase; resolução igual à base (commit vazio) conclui;
- cherry-pick limpo, recusa de ref não-hash, conflito → resolver → commit pelo painel; `cherry-pick-abort`; abort sem operação falha sem efeito;
- revert com conflito + `revert-abort`;
- conflitos modify/delete e binário resolvidos com `gitResolveSide` (incl. pathspec literal e token obsoleto);
- stash com arquivo não rastreado + conflito no apply: stash preservado, não rastreado restaurado, resolução e commit; stash com index em conflito não deixa estado parcial;
- HEAD/branch obsoletos (commit concorrente fora da IDE) recusam a operação.

Rust, `workspace.rs`: etag obsoleto após alteração externa; duas janelas com o mesmo etag (só a primeira grava); arquivo renomeado fora não é recriado; permissões preservadas e sem temporários; watcher `notify` real recebe criação externa e o salvamento atômico, e o filtro descarta `.git`, `node_modules` e `.php-ide-*`.

TypeScript: `tests/workspace-sync.test.ts` (`npx tsx --test tests/workspace-sync.test.ts`) — recarga de buffer limpo, buffer sujo preservado, aviso único, exclusão, recarga explícita, evento do próprio salvamento sem aviso.

Remotos (`node scripts/check-git-remotes.mjs`, testes `#[ignore]` `live_ssh_remote`/`live_https_remote`):
- Constrói `php-ide-test-git-server:2` (Alpine 3.20: git, git-daemon/`git-http-backend`, openssh, lighttpd + mod_auth/openssl). Gera no host chave ed25519, usuário e senha aleatórios; no container gera host keys e certificado TLS autoassinado (SAN 127.0.0.1). Portas só em `127.0.0.1`; container com label `php-ide.test=true` removido no fim, pasta temporária apagada.
- SSH (`git-shell`, só chave): perfil SSH salvo pela IDE; host desconhecido falha sem prompt (BatchMode); chave não autorizada falha; com `known_hosts` do teste: `gitTestAccount`, push, fetch, checkout-remote, pull fast-forward, pull divergente recusado sem alterar HEAD, push não-fast-forward recusado.
- HTTPS (basic auth + TLS): certificado não confiável falha; sem credencial falha sem prompt em < 25 s; senha errada falha; URL com credencial é exibida como `[credencial omitida]`; senha nunca aparece em `.git/config`; mesmo roteiro de push/fetch/pull. A senha chega ao Git por um helper de teste que lê variável de ambiente; `credential.helper=""` zera helpers herdados (ex.: osxkeychain), sem tocar o chaveiro real. SSH usa `-F /dev/null` e `UserKnownHostsFile` próprio, sem ler/gravar `~/.ssh`.

Bancos (`node scripts/check-database-versions.mjs [imagem ...]`): executa o teste existente `database::tests::live_fixtures` (sem editar `database.rs`) contra um container por vez — `postgres:13`, `postgres:16`, `postgres:17`, `mysql:5.7` (amd64 emulado), `mysql:8.4`, `mariadb:10.6`, `mariadb:11.4` — e o teste SQLite embutido. Relatório em `.artifacts/database-versions.json`. Sem a imagem no cache local o script não baixa (falha a versão com mensagem clara); `--pull` autoriza o download com limite de 15 min, para que um registro inacessível não trave a matriz.

## Resultados (2026-10-23, macOS arm64, Docker 29.2.1)

- `cargo test git::` — 15 passed, 2 ignored (remotos); `cargo test workspace::` — 4 passed.
- `node scripts/check-git-remotes.mjs` — `live_https_remote` ok, `live_ssh_remote` ok; nenhum container restante.
- `npx tsx --test tests/workspace-sync.test.ts` — 2 passed. `npm run typecheck` — ok.
- Matriz de bancos: ver seção "Matriz de versões" abaixo.
- `npm test` completo: 62 passed, 5 ignored. `node scripts/check-locales.mjs`: ok.
- Nativo: `node scripts/check-native.mjs --no-db --editor-only` — ok (janela Tauri inicia com a sincronização de buffers ligada). O roteiro core completo (`--no-db`) **expirou** (180 s e 420 s) sem relatório nem stderr; repetido com a chamada `mountWorkspaceSync` desativada, expirou igual — o travamento não vem desta fatia (provavelmente um passo de outra sessão em andamento). Precisa ser reexecutado pela coordenadora quando a pasta estabilizar.

## Limitações

- Perfil SSH da IDE não gerencia `known_hosts`: host desconhecido falha (seguro, sem prompt), mas o usuário precisa confiar o host fora da IDE. O teste injeta `UserKnownHostsFile` por config local.
- HTTPS depende de helper de credencial do sistema/usuário; a IDE não pede senha (decisão de não persistir senhas). Sem CA customizada pela UI (`http.sslCAInfo` só por config).
- `stash apply` com conflito no index (`--index`) é recusado pelo Git sem fallback automático para aplicar sem `--index`.
- `conflict` como origem de conflito sem estado é hipótese (normalmente stash).
- Sincronização de buffers: recarga usa `setValue` (perde undo/cursor do buffer limpo recarregado); o eco do próprio salvamento é tratado por igualdade de conteúdo. Sem teste nativo da janela para este fluxo (o roteiro nativo `src/native-smoke.ts` não é desta sessão).
- Não testado: submódulos, LFS, rebase interativo, merge com renomeação/diretório, Windows/Linux, servidores Git hospedados reais (intencionalmente).
- MySQL 5.7 roda emulado em arm64; tempo e estabilidade dependem do Docker Desktop.

## Achados fora dos arquivos desta sessão

- `src-tauri/src/main.rs` (watcher): o debounce de 200 ms para PHP usa um único `pending` global e repassa ao `language.changed` apenas o **primeiro** caminho do intervalo; os demais arquivos PHP alterados juntos (ex.: checkout/merge) são descartados nesse caminho. O frontend também chama `language.changed` por evento, o que pode mascarar o problema — vale acumular os caminhos num conjunto.
- `src-tauri/src/process.rs`: `GIT_LITERAL_PATHSPECS` não cobre `checkout`/`rm --cached` via outros comandos; contornado com `:(literal)` aqui.

## Proposta para catálogo/matriz

- Git › merge/rebase/cherry-pick/revert/stash com conflito: **implementado + teste Rust próprio** (abort de cherry-pick/revert e aceitar lado para exclusão/binário novos). Sem validação comparativa com PhpStorm.
- Git › push/pull/fetch SSH e HTTPS: **teste Rust contra servidor descartável** (`check-git-remotes.mjs`); limitação de `known_hosts` e de helper de credencial registrada.
- Editor › arquivo aberto alterado externamente: **implementado** (recarga de buffer limpo, aviso e recarga explícita para buffer editado), teste TS de unidade; falta teste nativo.
- Bancos › versões: matriz executável `check-database-versions.mjs` com o resultado abaixo; não promove versões fora da lista.

## Matriz de versões

Execução de 2026-10-23 (`node scripts/check-database-versions.mjs`), cada versão em container próprio removido ao fim; teste `live_fixtures` (conexão, senha errada recusada, CREATE/INSERT 55 linhas, listagem, paginação 50+5, NULL, truncamento 513, chave primária, DDL, modelo, somente leitura, desconexão):

| Versão | Resultado |
|---|---|
| PostgreSQL 16 | OK |
| MySQL 8.4 | OK |
| MariaDB 11.4 | OK |
| SQLite (sqlx embutido) | OK (`sqlite_browse_page_and_ddl`) |
| PostgreSQL 13, PostgreSQL 17, MySQL 5.7, MariaDB 10.6 | **Não executado**: imagem ausente no cache e `docker pull` travado (nem `busybox` baixava; o registro estava inacessível a partir do Docker nesta máquina). Rodar `node scripts/check-database-versions.mjs --pull` quando a rede do Docker voltar. |

Nenhum bug de banco foi revelado nas versões executadas; nada a reportar para `database.rs`. Versões não executadas continuam sem evidência nesta fatia.
