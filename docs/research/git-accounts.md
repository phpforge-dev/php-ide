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

## Limitações

- Não há login OAuth pelo navegador nem botão "Generate". O token é colado manualmente.
- O avatar mostra iniciais locais, sem buscar a imagem do servidor (a IDE não faz chamadas de rede).
- A conta padrão é global na IDE e só pré-seleciona a escolha. No PhpStorm, ✓ vale para o projeto atual.
- Remotos SSH ignoram o token da conta e continuam usando a chave/agent do sistema. O diálogo antigo "Identidade e autenticação locais" segue disponível.
- Hooks `pre-push` recebem o ambiente do processo git e, portanto, poderiam ler o token.
- Não há validação do token contra a API do GitHub/GitLab: o primeiro push revela um token inválido.
- A tela é um diálogo próprio do plugin, aberto por "Contas Git…" nas Configurações. As Configurações da IDE não têm árvore de páginas.
- Não houve comparação lado a lado com o PhpStorm. A compatibilidade não foi validada.
