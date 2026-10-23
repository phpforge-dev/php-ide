# Registro exploratório — PhpStorm

Data: 21/10/2026. Ensaio de preparação e viabilidade da observação pública. Este registro **não é uma execução aprovada de C01–C06** e não contém comparação com nossa IDE, que ainda não existe.

## Perfil conhecido

| Campo | Valor e origem |
|---|---|
| Autorização | Pedido do usuário para investigação comportamental; trial ativado informado na conversa |
| Aplicação | `/Applications/PhpStorm.app`; aberta via comando público do macOS |
| Versão | `2026.1.4`, texto da tela Welcome e diálogo de confiança lidos por acessibilidade |
| Build da IDE | Não coletado; pendente About |
| SO | macOS 26.3.1 (a), build 25D771280a, consultado com `sw_vers` |
| Projeto | Cópia descartável de `fixtures/php-intelligence`, criada em diretório temporário `phpstorm-behavior-*` |
| PHP level | Barra de status mostrou `PHP: 8.2` |
| Runtime CLI | PHP e Composer não encontrados no PATH desta sessão; ensaios estáticos não dependem de executá-los |
| Keymap e plugins | Não inventariados. A barra de status mostrou `Gemini Code Assist: Inactive`; isso não prova ausência de outros plugins |
| Índice | Barra mostrou `Ready` e também `Hide processes (1)`; não estabelecer conclusão de indexação completa apenas com esses textos |
| Captura | Screenshot por janela falhou; nenhuma imagem de referência foi coletada ou adicionada ao repositório |

## Observações e limites

| ID | Entrada | Saída observada | Conclusão permitida |
|---|---|---|---|
| OBS-ENV-01 | Consultar acessibilidade do macOS | `false` antes; `true` após habilitação pelo usuário | Leitura/automação pública disponível parcialmente |
| OBS-PROJECT-01 | Abrir cópia sintética com PhpStorm | Diálogo de confiança com opções Don't Open, Preview in Safe Mode, Trust Project | Projeto exige decisão de confiança; não mede indexação |
| OBS-PROJECT-02 | Aceitar confiança para a fixture própria | Janela `project` com menus File, Edit, View, Navigate, Code, Refactor, Run, Tools, VCS, Window, Help | Abertura observada; restauração e fechamento não testados |
| OBS-NAV-01 | Ler menu Navigate | Declaration or Usages, Implementation(s), Type Declaration, Super Method, Search Everywhere, File…, Symbol…, Back e Forward | Ações existem; destinos e qualidade não foram validados |
| OBS-SEARCH-01 | Navigate → File…, consultar `probe.php` | Linha acessível `probe.php .../probe.php`; depois janela `project – probe.php` | Busca e abertura deste arquivo observadas; ranking/ambiguidade não testados |
| OBS-EDITOR-01 | Ler área Editor for probe.php | Texto sintético completo recuperado pela API pública de acessibilidade | Conteúdo exibido; inferência e posições de navegação ainda não comprovadas |
| OBS-STATUS-01 | Ler barra de status | PHP 8.2, LF, UTF-8, 4 spaces, Ready, Trial | Contexto parcial da sessão, sem inferir licença ou configuração interna |
| OBS-LIMIT-01 | Solicitar árvore completa da janela principal | Erro AppleEvent `-10000`; leituras direcionadas de filhos funcionaram | Limitação de automação, não falha da funcionalidade PHP |
| OBS-LIMIT-02 | Definir AXSelectedTextRange para primeiro label | Setter aceitou, leitura posterior continuou `1, 0` | Cursor não estabelecido; tentativa de Go to Definition inconclusiva |
| OBS-LIMIT-03 | Capturar apenas janela via screencapture | `could not create image from window` | Captura indisponível nesta tentativa; causa exata não diagnosticada |
| OBS-LIMIT-04 | Buscar Go to Line em Find Action | Retornou entradas de configuração; abriu Settings de esquema de cores | Ensaio interrompido e cancelamento solicitado; não usar como resultado de navegação |

As saídas são transcrições de leituras públicas na sessão, não screenshots nem logs de execução de uma suíte automatizada. As chamadas podem ter timing/foco diferente de uma interação humana. Não atribuir ao PhpStorm um resultado semântico quando a automação não estabeleceu cursor/foco com segurança.

No encerramento desta rodada, a janela Settings continuou listada mesmo após tentativas públicas de Cancel/Esc. Não foi acionado Apply/OK nem alterado intencionalmente qualquer valor de configuração. O cancelamento não foi confirmado; a janela ficou aberta para fechamento manual. Esse comportamento reforça que o transporte atual de ações não é confiável o suficiente para os ensaios semânticos.

## O que falta para encerrar M1

Registrar build, keymap e plugins; estabilizar navegação/seleção por UI ou executar roteiro manual assistido; confirmar estado do índice; executar C01–C06 com repetições e snapshots. A captura visual pode ser habilitada separadamente, mas não se deve presumir que acesso de acessibilidade inclui gravação de tela. Guardar screenshots fora do Git e sem dados pessoais.

Não houve leitura de implementações, caches, bytecode ou recursos internos do PhpStorm. Não houve instalação ou execução do REA. Nenhuma afirmação sobre algoritmos internos é derivada destas observações.
