# Projetos recentes — recorte Rust/Tauri

2026-10-22. Requisito: acesso a projetos recentes com organização próxima ao PhpStorm.

Referência documental: o [widget de projeto](https://www.jetbrains.com/help/phpstorm/new-ui.html) oferece acesso a projetos recentes e abertura de projetos existentes. O fluxo também é descrito em [Open, move, and close projects](https://www.jetbrains.com/help/phpstorm/open-close-and-move-projects.html). Não houve medição comparativa nem observação da instalação local nesta rodada.

## Comportamento entregue

- Clique no nome do projeto na barra superior: popup com **Abrir projeto…**, busca e lista de recentes.
- Nome, caminho completo (com tooltip quando truncado), identificação do projeto atual e indicação de pasta indisponível.
- Clique abre na janela atual. Projeto atual fecha o popup sem reiniciar serviços. Alterações não salvas bloqueiam a troca com mensagem e preservam o conteúdo.
- Reabertura efetiva usa o mesmo reset de editor, histórico, Git, terminais, bancos, agente e plugins da abertura por diálogo nativo.
- Remover entrada e limpar lista afetam somente metadados do histórico; não apagam pastas ou arquivos.
- Setas percorrem projetos disponíveis; Enter abre o primeiro resultado quando o foco está na busca; Esc fecha e devolve foco ao seletor.
- Pasta ausente permanece identificada na lista. Para projeto movido, usar **Abrir projeto…** para selecionar o novo local e remover a entrada antiga.
- Histórico de até 30 caminhos canônicos, sem duplicar reaberturas, ordenado por uso mais recente. Limite é uma escolha própria, não medição do PhpStorm.
- Inicialização sem raiz explícita reabre o primeiro recente disponível; sem entrada disponível, mantém o fixture de demonstração já usado pela aplicação. `PHP_IDE_PROJECT` continua tendo precedência.

## Arquitetura e independência

`src/recent-projects.ts` organiza o popup e seus estados. `src/main.ts` centraliza a troca de projeto; `src/native.ts` reinicia o host de linguagem também na reabertura por recente.

`src-tauri/src/recent.rs` salva `recent-projects.json` no diretório de configuração do aplicativo. Somente nomes/caminhos são persistidos. Gravação via arquivo temporário e rename; lock do sistema operacional evita sobrescrever atualizações concorrentes e é liberado com o fechamento do processo. Histórico inválido gera erro recuperável na interface e é preservado para não perder os dados existentes.

IPC restrito: listar, esquecer, limpar e reabrir uma entrada registrada. Não há comando de abertura arbitrária por caminho no renderer; novas pastas entram pelo seletor nativo. Remoção de entrada não altera o projeto ativo.

Testes usam `PHP_IDE_STATE_DIR` em perfil temporário, separado do histórico real do usuário. Nenhum dado é extraído do PhpStorm.

## Critérios de aceitação e evidências

- Rust: persistência por nova instância do store, MRU sem duplicação, pasta apagada, tentativa de reabertura de entrada inexistente, remoção/limpeza sem apagar arquivos, JSON inválido preservado e concorrência bloqueada sem perda do conteúdo.
- Tauri: listar e filtrar recentes, indicar pasta indisponível, bloquear troca com buffer sujo, preservar edição, abrir segundo projeto, limpar modelos antigos, atualizar MRU, voltar ao anterior e remover entrada com persistência.
- Perfil temporário contém dois projetos sintéticos e uma pasta ausente. Testes de janela usam cliques DOM sintéticos.
- Visual: `.artifacts/recent-projects-preview.png`, gerada pelo Chrome com transporte simulado por `scripts/preview-workbench.mjs`; revisada visualmente. Não é screenshot do PhpStorm ou prova do backend nativo.

Estado de equivalência: **Em desenvolvimento**. Recorte funcional implementado; não há validação comparativa global.

Limites: troca somente na mesma janela; sem grupos, favoritos, tela Welcome dedicada, gerenciamento de múltiplas janelas ou opção visual para alterar a política de reabertura. Diretório movido exige escolher o novo local. Permissões de filesystem e histórico corrompido exibem erro; a recuperação do JSON pode exigir intervenção no arquivo.

## Verificação final

Typecheck e sete testes Rust aprovados. `node scripts/check-native.mjs --packaged --no-db` aprovado em 15 grupos, incluindo navegação por teclado no seletor e troca completa de projetos. Relatório `.artifacts/native-packaged.json`. A suíte de janela usa perfil temporário. O harness agora posiciona/foca sua própria janela quando o modo smoke está ativo; a execução anterior parava na navegação com janela não focada. A nova execução completa passou após esse ajuste. Progresso de diagnóstico em `.artifacts/native-packaged.progress`, habilitado somente pelo modo smoke.
