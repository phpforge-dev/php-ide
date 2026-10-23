# Git — branches e sincronização

## Referência e escopo

Requisito do usuário: criar, trocar e apagar branches, fetch e pull com acesso simples. A documentação pública do [PhpStorm: branches](https://www.jetbrains.com/help/phpstorm/manage-branches.html) descreve o widget no cabeçalho, criação com checkout opcional, listas locais/remotas e checkout remoto com tracking. A documentação de [sincronização](https://www.jetbrains.com/help/phpstorm/sync-with-a-remote-repository.html) distingue fetch, atualização do upstream e pull com escolha de origem/estratégia.

Evidência documental, consultada em 2026-10-22. Não foi feita observação direta da instalação licenciada nesta sessão: o controle nativo da janela não está disponível. Não se afirma identidade visual nem equivalência integral. Código independente, Git CLI público via Rust/Tauri.

## Especificação implementada

| ID | Propósito e comportamento | Dependências | Complexidade / prioridade | Estado |
|---|---|---|---|---|
| GIT-BRANCH-POPUP-001 | Nome da branch no topo abre popup com busca, grupos locais/remotos, branch atual e upstream; ações próximas a cada item | gitStatus, gitTools, tema, i18n | Média / alta | Implementada |
| GIT-BRANCH-CREATE-002 | Formulário de nome, checkout opcional marcado por padrão; validação por Git; nomes duplicados ou inválidos preservam repositório e mostram erro | git branch/switch, HEAD atual | Média / alta | Implementada |
| GIT-BRANCH-SWITCH-002 | Troca local direta; remoto cria branch local com tracking; colisão local nunca reseta commits | git switch, refs, upstream | Média / alta | Implementada |
| GIT-BRANCH-DELETE-002 | Confirmação explícita do nome; somente branch local não atual; git branch -d recusa commits não integrados | Git CLI | Baixa / alta | Implementada |
| GIT-FETCH-002 | Botão direto executa fetch --all e atualiza lista; permite buffers alterados, sem recarregar editor | remotos, autenticação Git existente | Média / alta | Implementada |
| GIT-PULL-002 | Botão direto integra upstream da branch atual com --ff-only; indisponível sem upstream; erros aparecem no popup | upstream, autenticação, árvore limpa | Média / alta | Implementada |

As operações que modificam o projeto bloqueiam buffers não salvos e alterações em disco que exigem commit/stash. Não há stash automático ou descarte forçado. O backend verifica HEAD e, no popup, branch atual antes de executar. Durante a operação os controles ficam bloqueados; Escape não fecha até concluir. Após operações que podem modificar arquivos, a árvore/editor são reconciliados inclusive em erro. Fetch preserva modelos abertos. As demais operações anteriores continuam em “Mais operações Git…”. Português e inglês incluídos.

## Critérios de aceitação e testes

1. Abrir pelo topo sem exigir painel Git; buscar filtra sem modificar estado.
2. Criar com/sem checkout, trocar para main, excluir branch integrada após confirmação.
3. Fetch conserva HEAD, arquivo modificado em disco e buffer não salvo, e descobre branch remota.
4. Pull baixa commit de remoto local descartável e atualiza arquivo; árvore alterada bloqueia integração.
5. Checkout remoto cria upstream correto; colisão e exclusão não integrada preservam commits locais.
6. Nome inválido e estado obsoleto retornam erro sem executar alteração.

`git::tests::branches_fetch_pull_and_tracking_preserve_local_commits` testa o backend com dois repositórios e remoto bare descartáveis, sem serviços/contas reais. `src/native-smoke.ts` testa o popup no WebView Tauri com Git real: criar, buscar, trocar, confirmar exclusão, fetch preservando modelo e bloqueio de buffer alterado.

## Verificação

Build/typecheck e 22 testes Rust aprovados. O roteiro visual com transporte simulado `scripts/check-branches-ui.mjs` passou em seis verificações, incluindo busca, cancelamento de exclusão e atualização da branch atual. Prévia em `.artifacts/git-branches-en.png`. `node scripts/check-native.mjs --packaged --no-db` aprovou 20 grupos no aplicativo Tauri empacotado, incluindo o novo fluxo de branches e fetch preservando buffer não salvo. Essa execução não testa bancos reais nem equivalência comparativa com o PhpStorm.

## Diferenças conhecidas

Pull neste recorte atualiza somente o upstream com fast-forward; não oferece escolha de remoto/branch, merge ou rebase no popup. Sem favoritos, branches recentes, tags, prefixos expansíveis, comparação de branches, checkout/update combinado, Smart Checkout, operações em múltiplos roots ou exclusão remota. Autenticação usa a configuração Git por repositório já existente. Erros brutos do Git/backend podem permanecer no idioma original. Esses limites não são compatibilidade validada com o PhpStorm.
