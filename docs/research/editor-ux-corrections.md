# Correções de editor e UX


## Correção de interação e acabamento — 2026-10-22

Requisito do usuário: Cmd+clique e autocomplete utilizáveis, ícones PHP, sintaxe e fluxos de banco/agente mais cuidados. Continua **Em desenvolvimento**, sem promoção de compatibilidade com PhpStorm.

- Navegação pelo ponto clicado com ⌘ ou Ctrl, histórico de retorno e tratamento de erro visível. A chamada não depende de um link de hover previamente calculado.
- Sugestões retornam sem resolver até 80 itens em série; detalhes/documentação são resolvidos sob demanda pelo item selecionado. Falhas de análise aparecem na barra de estado.
- Detecção de PHP local 8.2+ (PATH, Homebrew PHP 8.3 ou `PHP_IDE_PHP_BIN`), com Docker como alternativa. Abertura de PHP prepara a análise. Docker indisponível agora produz uma instrução de recuperação. Instalado PHP 8.3 local nesta máquina para executar os testes sem o daemon Docker, que não respondeu nesta sessão.
- Ícone PHP original compartilhado entre árvore e abas; cores próprias para categorias de sintaxe; coloração de pares de colchetes desativada.
- Banco: diálogo dedicado com PostgreSQL e MySQL/MariaDB, porta por driver, testar sem manter sessão, conectar, erro visível e limpeza da senha ao fechar. Botão de adicionar não fica sob o botão de ocultar painel. Oracle, SQL Server e Redis continuam planejados.
- Agente: apresentação inicial, exemplos editáveis, seletor de provedor e compositor reorganizado. Contexto da IDE exige seleção explícita. O protocolo e a revisão das alterações continuam independentes do desenho visual.

Evidências e limites:

- `npm run typecheck` e quatro testes Rust aprovados.
- `.artifacts/native-smoke-core.json`: 11 grupos na janela Tauri, incluindo abrir `probe.php` pela árvore, evento DOM de mousedown com Meta no símbolo, esperar `src/User.php`, voltar, abrir widget de sugestões e aceitar método. Este evento é **sintético**, não comprova o gesto físico do mouse no macOS. Teste de diálogo cobre seleção de driver/porta e limpeza da senha.
- `scripts/preview-workbench.mjs`: revisão visual e cliques Playwright em navegador Chrome, com transporte simulado. Imagens `.artifacts/{workbench,agent,database}-preview.png` são fixtures visuais, não screenshots de PhpStorm nem prova do backend nativo. Esse teste encontrou a sobreposição do botão de ocultar painel sobre o botão adicionar, corrigida antes da entrega.
- Nesta rodada os bancos reais descartáveis não foram reexecutados: daemon Docker indisponível. O novo caminho de testar/conectar precisa de validação integrada com servidores. ACP usa agente sintético; nenhuma inferência paga foi executada.
- Não houve comparação visual lado a lado com o PhpStorm nesta rodada. Qualidade visual e equivalência global permanecem abertas.

- Pacote final: `node scripts/check-native.mjs --packaged --no-db` aprovado nos mesmos 11 grupos, sem Vite, usando PHP local. Relatório `.artifacts/native-packaged.json`.
