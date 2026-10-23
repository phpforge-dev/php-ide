# Recorte 07 — identidades e autenticação Git por repositório

22/10/2026. Requisito: usar contas distintas em repositórios distintos sem trocar configuração global.

## Implementação

Git → **Conta deste repositório…** mostra identidade efetiva, valores locais, usuário HTTPS, indicação de credential helper/SSH e URLs de fetch/push dos remotos. Permite:

- Definir `user.name` e `user.email` locais ou remover esses valores diretos para herdar a configuração do Git. A identidade efetiva é consultada com `git var GIT_AUTHOR_IDENT`.
- Preservar autenticação atual (padrão), configurar usuário HTTPS local com `credential.useHttpPath=true`, escolher o caminho absoluto de uma chave SSH existente, ou remover os overrides locais administrados pelo painel.
- Usar os credential helpers já configurados, SSH Agent e configuração SSH do sistema. Não lê conteúdo de chaves nem armazena senha/token. URLs HTTP com credenciais embutidas são redigidas antes de retornar ao renderer.
- Testar a configuração salva com `git ls-remote`: somente leitura, sem fetch/push, com timeout. Sucesso não comprova permissão de escrita nem qual conta autenticou: remotos públicos podem aceitar acesso anônimo.

Gravação modifica apenas o arquivo local de configuração, com lock Git, cópia temporária, comparação de versão e rename. A fila de mutações do Git também serializa a gravação em relação a commit e demais operações. Configuração global e arquivos incluídos permanecem intactos. Rejeita configuração via symlink, entradas inválidas, edição obsoleta e lock existente. Worktrees do mesmo repositório podem compartilhar configuração local; o painel informa isso.

## Limitações explícitas

- Não é um gerenciador OAuth de contas GitHub/GitLab. O usuário precisa ter credenciais disponíveis no helper ou chave carregada no agent; não há diálogo de senha/token próprio.
- Não altera URLs nem cria remotos. O protocolo da URL precisa corresponder ao método escolhido. URLs/aliases SSH existentes são respeitados.
- Configurações avançadas existentes (includeIf, credential por URL, configuração específica de worktree e SSH) seguem a precedência nativa. Remover overrides diretos não remove valores vindos desses arquivos. O painel mostra identidade efetiva após salvar.
- O teste lista refs do remoto de fetch, não testa todos os push URLs. Não confirma autenticação em provedores externos nem autorização para push.
- SSH explícito usa OpenSSH, caminho escapado e BatchMode; Windows e outros clientes SSH ainda não validados. Nenhuma conta real foi acessada pelos testes.

## Testes

`tests/git-account.test.ts` usa HOME temporário, dois repositórios e remoto bare próprios. Cobre identidades diferentes em commits reais, preservação de configuração global/outro repo, restauração da herança, username e caminho entregues a um credential helper sintético, quoting de caminho SSH com aspas/metacaracteres, rejeição de versão antiga/lock/entrada inválida, leitura de remoto sem criar refs e remoção de credencial da URL enviada à UI.

`scripts/check-git-account-ui.ts` cobre abrir painel, configurar identidade/usuário HTTPS, bloquear teste enquanto há alterações não salvas, salvar, ler remoto local e reabrir com valores persistidos. Screenshot: `.artifacts/git-account.png`. Testes próprios não constituem validação comparativa com PhpStorm.

## Fontes públicas

- [git-config](https://git-scm.com/docs/git-config): escopos, identidade e core.sshCommand.
- [gitcredentials](https://git-scm.com/docs/gitcredentials): username, helpers e useHttpPath.

Build/typecheck, integração de contas e UI passaram. Regressão do fluxo de commit/Git verificada separadamente; a matriz não promove a família Git inteira para Validada.
