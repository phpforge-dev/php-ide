# Contas Git por projeto

Pesquisa, requisitos e validação das contas Git (Settings → Version Control → GitHub/GitLab etc.). As três fontes ficam separadas. Nada aqui descreve a arquitetura interna do PhpStorm.

## 1. Documentação pública da JetBrains (consulta em 30/10/2026)

- Em Settings → Version Control → GitHub, o botão + adiciona contas. Há três formas de login: *Log In via GitHub* (navegador, OAuth), *Log In with Token* e GitHub Enterprise (campo Server). Fonte: https://www.jetbrains.com/help/phpstorm/set-up-a-github-account.html
- É possível ter várias contas, por exemplo uma pessoal e outra corporativa. *Set as Default* (✓) vale para a conta selecionada "no projeto atual". Com uma conta padrão definida, a IDE não pergunta qual conta usar ao compartilhar o projeto, fazer rebase de fork, criar PR ou gist. Fonte: a mesma.
- A página atual exige os escopos clássicos `repo`, `gist`, `read:org`, `workflow`, `read:user` e `user:email`. Versões anteriores citavam só `repo`, `gist` e `read:org`. A IDE não bloqueia tokens fine-grained, mas eles não têm suporte completo. Fontes: a mesma e https://www.jetbrains.com/help/phpstorm/2025.2/github.html
- No GitLab, a documentação descreve só o login por token pessoal (escopos `api` e `read_user`), também com ✓ padrão por projeto. O login pelo navegador não foi confirmado. Fonte: https://www.jetbrains.com/help/phpstorm/set-up-a-gitlab-account.html
- O Bitbucket não tem página em Version Control. Ele aparece só no diálogo Clone e autentica pelo prompt do Git. Fonte: https://www.jetbrains.com/help/phpstorm/set-up-a-git-repository.html
- As senhas ficam em Settings → Appearance & Behavior → System Settings → Passwords, com as opções Keychain nativo, KeePass ou não salvar. A documentação não confirma literalmente que os tokens das contas GitHub/GitLab usam esse cofre. Fonte: https://www.jetbrains.com/help/phpstorm/reference-ide-settings-password-safe.html
- A documentação de push não diz qual conta é usada nem descreve uma escolha de conta (não confirmado). Para token expirado, o push mostra um aviso com *Use Token*. Fontes: https://www.jetbrains.com/help/phpstorm/commit-and-push-changes.html e a página de conta do GitHub.
- Autor: o commit tem o campo *Author* nas opções avançadas. Sem `user.name`, a IDE pergunta no primeiro commit. A página Git das Settings não tem nome nem e-mail. Não está documentado que a IDE altere `user.name` por projeto. Fonte: https://www.jetbrains.com/help/phpstorm/commit-and-push-changes.html
- *Use credential helper* em Settings → Version Control → Git mantém os helpers do Git. Fonte: https://www.jetbrains.com/help/phpstorm/settings-version-control-git.html

Notas completas com as URLs por afirmação estão nas notas de sessão da pesquisa. Elas não fazem parte do repositório.

## 2. Observação do print do usuário (PhpStorm, Settings → Version Control → GitHub)

- A árvore à esquerda mostra Version Control com as páginas Changelists, Commit, Confirmation, Directory Mappings, File Status Colors, Issue Navigation, Log, Shelf, Git, GitHub, GitLab e Mercurial.
- O breadcrumb é "Version Control › GitHub".
- A barra da lista tem +, − e ✓.
- Cada linha tem avatar redondo, nome e login (por exemplo "Jeidison Farias  jeidison") e host em cinza (`github.com`). Uma das contas está em negrito; supomos que seja a padrão, mas isso não foi confirmado.
- O print não mostra o fluxo de push nem a escolha de conta.

## 2b. Observação autorizada do PhpStorm 2026.1.4 (04/11/2026)

Capturas locais `.artifacts/phpstorm-reference/A-02` a `A-08` (fora do repositório; mostram nomes de contas do usuário). Nenhuma conta foi criada ou autorizada.

- GitHub: o + tem um indicador de menu. O menu tem *Log In via GitHub…*, *Log In with Token…*, um separador e *Log In to GitHub Enterprise…* (A-03). A barra tem só +, − e ✓. Não há botão de editar.
- *Log In with Token…* abre "Add GitHub Account" com *Server* (`github.com`), *Token* com foco, botão *Generate…* e a dica "The following scopes must be granted to the access token: [repo, gist, read:org, workflow, read:user, user:email]". Os botões são *Cancel* e *Add Account* (A-04). Com o token vazio, aparece o balão "Token cannot be empty" e o diálogo continua aberto (A-05). Não há campos de login, nome ou e-mail.
- *Log In via GitHub…* abre uma janela pequena "Log In to GitHub" com um indicador "Logging in…" e *Cancel* (A-06). O navegador abriu uma página de autorização em `account.jetbrains.com` com `code_challenge` (PKCE) e `callback_url` para `127.0.0.1:63342`. Isso é o comportamento visível. Não deduzimos daí a arquitetura interna.
- GitLab: o + não tem menu. Ele abre direto "Add GitLab Account" com *Server* `https://gitlab.com`, *Token*, *Generate…*, a dica "[api, read_user]" e o botão *Log In* (A-07, A-08). Isso confirma a documentação: o GitLab não tem login pelo navegador.
- As linhas mostram o avatar do servidor (foto ou identicon), o nome e o login em cinza (só o login quando não há nome) e o host. A conta padrão do projeto aparece em negrito.
- O aviso de token expirado no push não foi reproduzido, porque exigiria um token real expirado. O comportamento vem só da documentação.

## 3. Requisitos próprios (PHP IDE)

- Contas da IDE para GitHub, GitLab, Bitbucket e hosts genéricos, com nome, login, host, e-mail de autor e token.
- Escolha de conta por projeto, perguntada no primeiro commit ou push. A escolha fica na configuração local do repositório (`phpide.account`) e pode ser trocada pelo indicador no painel Commit, pelo ⚙ ou pelo menu ⋮.
- O commit usa o nome e o e-mail da conta (`GIT_AUTHOR_*`/`GIT_COMMITTER_*` só no processo `git commit`), não `user.name` global.
- Fetch, pull e push usam o token da conta por um credential helper efêmero. O token passa só pelo ambiente do processo git, nunca pela URL, argumentos, arquivo ou `localStorage`. `credential.helper` vazio desliga os helpers do sistema naquela execução, para que o token não seja regravado em outro cofre. O helper responde apenas para o host da conta, em HTTPS (HTTP só para localhost).
- O token fica no cofre do sistema: Keychain no macOS, Credential Manager no Windows e Secret Service no Linux, pelo crate `keyring`. A lista em `git-accounts.json` (no diretório de estado da IDE) não tem segredos.
- Erros recuperáveis:
  - Sem conta: abre a escolha.
  - Conta removida: o projeto pede outra e não volta em silêncio para a identidade do sistema.
  - Credencial recusada (401/403): a mensagem nomeia a conta e a escolha abre de novo.
- A opção explícita "Configuração do Git do sistema" é lembrada como `phpide.account=system`.

### Login pelo navegador, Generate e token expirado (plugin Git, 04/11/2026)

Critérios:

1. No GitHub, o + abre um menu com *Entrar via GitHub…*, *Entrar com token…*, um separador e *Entrar no GitHub Enterprise…*. O menu funciona com setas, Enter e Esc, e fecha ao clicar fora. No GitLab, Bitbucket e Outros hosts, o + abre direto o formulário.
2. *Entrar via GitHub…* usa o OAuth device flow (RFC 8628), que é público e não tem segredo de cliente:
   - o nativo pede o código a `github.com/login/device/code` com os escopos `repo gist read:org workflow read:user user:email` e abre `verification_uri` no navegador padrão, sem passar por um shell;
   - o diálogo "Entrar no GitHub" mostra o código, copia-o para a área de transferência e oferece *Copiar código*, *Abrir navegador novamente*, *Entrar com token…* e *Cancelar*;
   - a consulta respeita `interval` e `slow_down` (+5 s);
   - `authorization_pending` continua esperando; `access_denied` e `expired_token` mostram um erro com *Tentar novamente*;
   - Cancelar ou Esc descarta a sessão no nativo.
3. O `device_code` e o token nunca vão para a interface. O token vai direto para o cofre (Keychain). Depois, o nativo lê `/user` e `/user/emails` (e-mail primário verificado, ou o noreply `id+login@users.noreply.github.com`) e cria a conta. Se já existe uma conta com o mesmo host e login, ele só troca o token.
4. O client id do OAuth App é configuração pública: `PHP_IDE_GITHUB_CLIENT_ID` em tempo de execução ou `PHPIDE_GITHUB_CLIENT_ID` na compilação. Sem ele, o login pelo navegador mostra um erro que leva ao token. Não há segredo de cliente embutido.
5. *Entrar com token…* ("Adicionar conta GitHub/GitLab") pede só *Servidor* e *Token*, com *Gerar…* e a dica de escopos do PhpStorm. Com o token vazio, a mensagem é "O token não pode ficar vazio." e o formulário continua aberto.
6. O token novo de GitHub/GitLab é validado em `GET /user` (GitHub `api.github.com` ou `host/api/v3`; GitLab `host/api/v4`):
   - 401 recusa e não grava nada;
   - login, nome e e-mail vazios vêm da API (no GitLab, `commit_email`);
   - um login informado diferente do dono do token é recusado;
   - sem rede, a conta só é gravada se login, nome e e-mail foram preenchidos (edição pelo ✎).
7. *Gerar…* abre `github.com/settings/tokens/new?description=PHP+IDE&scopes=…` ou `gitlab/-/user_settings/personal_access_tokens?name=PHP+IDE&scopes=api,read_user`. Se o navegador não abrir, o endereço aparece no formulário.
8. Push com o token recusado (401/403 e "Authentication failed" quando o token da conta GitHub/GitLab foi de fato usado):
   - aparece o aviso "O token da conta X (host) expirou ou foi revogado" com a ação *Usar token…*, e não a escolha de conta;
   - a ação abre "Entrar no GitHub/GitLab" só com servidor (somente leitura) e token;
   - o token é validado e a operação pode ser repetida.

   SSH, remoto de outro host ou conta genérica mantêm a mensagem anterior, que reabre a escolha.
9. O GitLab não tem login pelo navegador, como mostram a documentação e a observação. Pedir esse login ao nativo devolve um erro que leva ao token.

O serviço novo é `gitAccountsLogin` (`start`, `poll`, `cancel`, `reopen`, `generate`). Ele precisa estar na allowlist do host (`src-tauri/src/tool_plugins.rs`).

## Validação

- `plugin-git/native/src/accounts_tests.rs`: um servidor HTTP local com Basic Auth na frente de `git http-backend`, com repositório bare descartável, contas falsas e cofre em memória (sem Keychain nem GitHub reais). O teste cobre:
  - o commit pede conta;
  - o autor e o committer são os da conta escolhida;
  - o push chega ao remoto com `alice:good-token`;
  - a troca para a conta com token inválido falha de forma recuperável sem alterar o remoto;
  - conta removida e a opção "sistema";
  - o token não aparece em `git-accounts.json` nem em `.git/config`.
- `plugin-git/tests/accounts.test.mjs` (DOM) cobre:
  - o atalho em Configurações;
  - adicionar duas contas, com validação de e-mail;
  - definir a conta padrão;
  - a pergunta no primeiro commit, com a padrão pré-selecionada;
  - a escolha lembrada no segundo commit;
  - a troca pelo indicador;
  - o erro de conta removida reabrindo a escolha;
  - a remoção da UI ao desativar o plugin.
- `plugin-git/native/src/oauth_tests.rs`: servidor OAuth/REST falso em 127.0.0.1, com client id, tokens e usuários falsos, cofre em memória e navegador apenas registrado. O teste cobre:
  - `start`, com o `device_code` fora da resposta;
  - `reopen`;
  - a consulta antes do intervalo, que não chama o servidor;
  - `authorization_pending`, seguido de token, conta criada e token só no cofre (nem no JSON nem na URL);
  - um segundo login que atualiza a mesma conta;
  - `access_denied`, `expired_token`, `slow_down` (+5 s) e `cancel`;
  - GitLab e Enterprise recusados;
  - client id ausente ou errado;
  - URLs de *Gerar* e endereços reais por host;
  - a validação de token (401, conta completada pela API, login diferente recusado, GitLab com `commit_email`, edição sem token sem consultar a API).
- `accounts_tests.rs::expired_github_token_on_push_offers_use_token`: `git http-backend` com Basic Auth e a API falsa. O teste cobre:
  - push com o token antigo, que mostra o aviso com o id da conta e sem o token;
  - *Usar token* com um token recusado, que não grava;
  - token válido, com o push seguinte chegando ao remoto;
  - conta genérica e token não usado mantendo a mensagem antiga.
- `plugin-git/tests/oauth.test.mjs` (DOM) cobre:
  - o menu do + e o teclado;
  - a falha de client id com *Tentar novamente*;
  - o login com código copiado e espera até a autorização;
  - cancelar sem consultar de novo;
  - *Gerar* sem navegador;
  - o formulário só com servidor e token e o token vazio;
  - Enterprise;
  - o GitLab sem menu;
  - Commit e Push com o token expirado, *Usar token*, token recusado, token aceito e o push repetido.
- `scripts/check-git-review-layout.mjs`, etapa 8 (WebKit, com `GIT_PLUGIN_DIR`): o menu, o código do device flow, *Gerar*, o formulário só com o token, o aviso no push e *Usar token*. As capturas ficam em `.artifacts/git-accounts-*.png` e `.artifacts/git-push-expired-token.png`.

## Limitações

- O login pelo navegador usa o device flow: o usuário digita o código mostrado. O PhpStorm usa uma página de autorização com redirect local e não mostra código. Só funciona com um OAuth App registrado pelo usuário, com *Enable Device Flow*, e com o client id configurado. Ainda não houve login real contra o GitHub, só contra o servidor falso.
- O GitHub Enterprise usa só token, sem login pelo navegador. O GitLab também, como no PhpStorm.
- O aviso de token expirado aparece no resultado do diálogo de operações, não como balão do sistema de notificações. Ele não distingue token expirado de revogado nem de permissão insuficiente (403).
- O avatar mostra iniciais locais, sem buscar a imagem do servidor.
- A conta padrão é global na IDE e só pré-seleciona a escolha. No PhpStorm, ✓ vale para o projeto atual.
- Remotos SSH ignoram o token da conta e continuam usando a chave/agent do sistema. O diálogo antigo "Identidade e autenticação locais" segue disponível.
- Hooks `pre-push` recebem o ambiente do processo git e, portanto, poderiam ler o token.
- Bitbucket e hosts genéricos não validam o token antes do push.
- A tela é um diálogo próprio do plugin, aberto por "Contas Git…" nas Configurações. As Configurações da IDE não têm árvore de páginas.
- Contas e menus foram comparados com as capturas A-02 a A-08 do PhpStorm. O fluxo de push com token expirado não foi comparado. A compatibilidade continua não validada.
