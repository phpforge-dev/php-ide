# Mensagem de commit com agente — requisito próprio (24/10/2026)

Implementação em fontes locais da IDE, `plugin-git` e `plugin-agents`. Sem observação comparativa ou alegação de compatibilidade com PhpStorm.

Na janela Commit, “Gerar com IA” envia exclusivamente as versões preparadas dos arquivos ao agente já conectado. A sugestão aparece em prévia editável; “Usar mensagem” preenche o formulário e mantém a revisão normal de commit. Nenhum commit ou push é disparado pela geração. O rascunho existente permanece intacto até aplicar; edições concorrentes e alterações no index impedem aplicação silenciosa de resultado desatualizado. Fechar descarta a sugestão e solicita interrupção da geração em andamento. Reset/troca de projeto invalida respostas atrasadas.

A integração usa `sdk.service('agents')`, hook aditivo do host para contribuições confiáveis opcionais; Git não recebe permissão para chamar IPC do agente. A contribuição Agents utiliza a sessão atual e recusa geração sem conexão, durante outra resposta ou com mudanças pendentes. O contexto inclui caminho e conteúdo antes/depois no index, limitado a 60.000 caracteres; commits maiores exigem redução. O pedido orienta resposta somente textual, sem ferramentas. As permissões e a revisão de alterações normais do agente continuam sob controle do painel Agente; esta implementação não cria uma sessão isolada nem garante que um provedor externo obedecerá à instrução textual.

## Evidências

- IDE: `npm run typecheck`, `npm run test:architecture`, `npm run test:unit` (189 aprovados, um ignorado), `npm run test:locales` aprovados.
- `npm test`: 36 testes Rust aprovados fora do sandbox; dentro dele o watcher macOS não recebeu eventos, falhando em duas tentativas.
- Ambos os plugins: build e quatro testes aprovados em cada pacote. Cenários novos: contexto preparado, prévia/editabilidade, preservação do rascunho, index alterado, resposta tardia, agente indisponível/ocupado, cancelamento, resposta vazia, falha de transporte e descarte.
- WebKit headless com CSS atual e agente simulado: apresentação inspecionada e aplicação da mensagem aprovada. Captura local em `/private/tmp/phpforge-commit-ai/preview.png`.

## Limitações e distribuição

Sem inferência real ou validação do fluxo novo na janela Tauri. Os bundles locais de ambos os plugins foram reconstruídos; publicação e atualização dos pins/hashes do catálogo e dos pacotes instalados não fazem parte desta alteração. O recurso requer a IDE com o hook `sdk.service` e as novas versões de ambos os pacotes. Os testes gerais que usam fontes fixadas do catálogo continuam exercitando as revisões anteriores; a evidência específica da geração vem dos testes nos repositórios dos plugins.
