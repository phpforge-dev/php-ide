# Inicialização, splash e boas-vindas

2026-10-22. Requisito: eliminar o intervalo visual vazio, restaurar projeto aberto e oferecer recentes, criar, abrir ou clonar quando não houver projeto.

## Referência e separação de evidências

A documentação oficial do [primeiro uso](https://www.jetbrains.com/help/phpstorm/run-for-the-first-time.html), [criação](https://www.jetbrains.com/help/phpstorm/new-project-wizard.html), [abertura/fechamento](https://www.jetbrains.com/help/phpstorm/open-close-and-move-projects.html) e [configuração de reabertura](https://www.jetbrains.com/help/phpstorm/system-settings.html) descreve Welcome, recentes, criação, abertura, clone e restauração de projetos. Nesta sessão o controle nativo de aplicações não estava disponível; **não houve inspeção da instalação local do PhpStorm nem comparação visual lado a lado**. Não afirmar animação ou sequência exata do PhpStorm a partir dessas fontes. Splash animado é requisito do usuário, implementado com identidade gráfica própria.

## Diagnóstico e comportamento implementado

O HTML anterior tinha apenas `#app` vazio; o bootstrap esperava listeners nativos e importação do workbench sem tratamento global de erro. Isso permitia uma janela vazia durante carga ou falha. Não foi capturada a execução específica que originou o relato, portanto essa análise não identifica com certeza o erro original. O novo HTML já contém splash, fundo escuro, símbolo original em CSS, animação que respeita redução de movimento e estado textual; a janela nativa tem fundo escuro. Bootstrap pequeno carrega o transporte e só importa Monaco/workbench quando há projeto.

- Splash visível durante inicialização e abertura; erro de carga apresenta mensagem, detalhe e Reiniciar. Aos 20s de inicialização oferece reinício sem cancelar silenciosamente a operação.
- Perfil limpo não abre fixtures. Boas-vindas tem sidebar, busca, lista de recentes com caminho, remoção da lista e indicação de pastas indisponíveis.
- Abrir usa seletor nativo existente. Novo projeto permite escolher pasta pai e nome; cria diretório novo com `index.php`, sem sobrescrever destino existente.
- Clonar recebe URL e destino, executa Git real por argv, sem shell, com hooks desabilitados e protocolo ext proibido. Credenciais seguem configuração externa do Git. Limite atual de 30s; falhas preservam eventual diretório parcial e explicam como recuperar. Não há cancelamento/progresso percentual neste recorte.
- Sessão ativa fica em `startup-project.json`, separada do MRU. Reiniciar com projeto ativo restaura sua raiz. Fechar projeto exige salvar buffers, encerra serviços vinculados ao trocar a raiz, grava sessão sem projeto e volta às boas-vindas. Histórico continua disponível.
- Se o projeto de sessão não existe, mostra boas-vindas. Instalações anteriores sem arquivo de sessão migram usando o primeiro recente disponível. Arquivo de sessão ilegível não abre diretórios arbitrários nem é usado para selecionar um fixture.

## Arquitetura e aceitação

`index.html` contém apresentação inicial; `src/bootstrap.ts` coordena splash/erro/Welcome/workbench; `src/welcome.ts` e CSS oferecem fluxos; `main.ready` confirma árvore inicial carregada antes de retirar splash. Rust mantém estado ativo e cria/clona em `startup.rs`; persistência da sessão em `recent.rs`. Nenhum backend Node de produção.

| ID | Funcionalidade | Prioridade | Complexidade | Aceitação | Estado de equivalência |
|---|---|---|---|---|---|
| STARTUP-SPLASH-001 | Splash e falha recuperável | Alta | Média | HTML inicial visível; fundo nativo escuro; erro com reinício; só retirar após carga | Em desenvolvimento |
| PROJECT-WELCOME-001 | Boas-vindas e recentes | Alta | Média | Perfil limpo sem fixture; buscar/abrir/remover; indisponível desabilitado | Em desenvolvimento |
| PROJECT-CREATE-001 | Novo projeto PHP | Alta | Média | Diretório e PHP criados, projeto ativo; escape/sobrescrita rejeitados | Em desenvolvimento |
| PROJECT-CLONE-001 | Clonar Git | Alta | Média | Clone local real pela interface; destino existente rejeitado; falha visível | Em desenvolvimento |
| PROJECT-SESSION-001 | Restaurar/fechar projeto | Alta | Média | Sessão persistente separada do MRU; fechar preserva recentes; pasta ausente vai ao Welcome | Em desenvolvimento |

Dependências: Tauri2/Rust, configuração de usuário, seletor nativo e Git no PATH para clone. Sem bibliotecas de produção novas.

## Evidência e limites

13 testes Rust aprovados, incluindo criação, rejeição de escape/sobrescrita, clone local real e sessão (restauração, fechamento e pasta removida). `scripts/check-startup.mjs` executa o pacote Tauri com perfil temporário e repositório Git próprio: seis cenários aprovados em `.artifacts/startup-native.json`. UI, IPC, escrita e Git são reais; nenhum repositório remoto ou conta real é usado.

`preview-startup.mjs` gera imagens de splash, Welcome e novo projeto com dados simulados; são revisão visual no Chrome, não screenshots do PhpStorm nem prova do backend. Também provoca ausência do transporte Tauri para verificar erro e botão de recuperação.

Diferenças: sem grupos/favoritos, wizard de frameworks/Composer, remote development, múltiplas janelas, cancelamento/progresso de clone, restauração de abas/buffers não salvos e configuração visual de reabrir projetos. Clone remoto/SSH/autenticação e Windows ainda sem ensaio específico. Não marcar compatibilidade global como validada.

## Fechamento da verificação

A regressão geral no pacote assinado passou nos 17 grupos (`.artifacts/native-packaged.json`, sem falhas), além dos seis cenários dedicados à inicialização e dos 13 testes Rust. Foi corrigido o temporizador do splash, que agora termina antes dos testes/uso do workbench. A marca Git recebeu alvo DOM explícito e identificação do bloco, evitando depender da classificação do gutter pelo hit-test do Monaco; o fluxo nativo de diff e autoria passou.

`codesign --verify --deep --strict` inicialmente detectou assinatura inconsistente do bundle macOS. A assinatura ad-hoc do pacote completo corrigiu essa verificação; `bundle.macOS.signingIdentity` agora usa `-`, mecanismo descrito pela [documentação oficial do Tauri](https://v2.tauri.app/distribute/sign/macos/). Trata-se do pacote para uso local, sem notarização de distribuição pública. Essa inconsistência é evidência adicional de empacotamento; não prova, isoladamente, a causa da tela branca relatada.

## Janela compacta — 23/10/2026

Requisito do usuário: ao fechar o projeto, retornar a uma janela menor centralizada, como relatado no PhpStorm. `src/window-layout.ts` aplica Welcome de 960×680 pontos lógicos, mínimo 760×520, saindo de maximização/tela cheia antes de centralizar. Ao abrir/criar/clonar um projeto, restaura dimensões e, quando ainda está no monitor atual, posição anterior; também restaura maximização/tela cheia. O estado dura a sessão e sobrevive ao reload de Fechar projeto via sessionStorage. Sem estado anterior, usa a área de trabalho padrão de 1440×940.

As permissões Tauri foram limitadas às operações de janela necessárias. O smoke de startup confere tamanho compacto na abertura e após fechar, além da restauração ao abrir projeto. O requisito é próprio, informado pelo usuário; não há medição comparativa nova. Telas pequenas, múltiplos monitores e transições de tela cheia ainda precisam de ensaios adicionais.

Validação deste ajuste: typecheck aprovado; 62 testes Rust aprovados (5 ignorados); smoke do aplicativo empacotado aprovado com 10 cenários, incluindo dimensões da Welcome e restauração ao abrir projeto. Centralização é aplicada pela API nativa Tauri; a geometria em múltiplos monitores não foi medida automaticamente.
