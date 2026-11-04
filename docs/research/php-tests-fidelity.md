# PHPUnit/Pest — fidelidade da execução de testes (04/11/2026)

Plugin externo `phpforge.php-tests` (`~/Projects/plugin-php-tests`, um commit por item no `main` local, sem push nem versão nova). Este documento separa **evidência documental (DOC)**, **observação autorizada da referência (OBS)**, **requisito próprio (REQ)** e **hipótese (HIP)**. Teste da nossa IDE não promove compatibilidade: nenhuma linha do catálogo muda de "Não validada".

## Fontes e observação

- DOC: ajuda pública da JetBrains — *Run/Debug configuration: PHPUnit*, *Test Runner tab*, *Code coverage*, *PHP test frameworks*; documentação do PHPUnit (`--teamcity`, `--filter`, `--coverage-clover`) e do Pest (Datasets, Expectations, Higher Order Expectations). Formato TeamCity "Service Messages" (documentação pública do TeamCity).
- OBS (04/11/2026, autorizada pelo usuário, PhpStorm 2026.1.4 Islands Dark, PHPUnit 11.5.57 na fixture `phpunit`): capturas locais em `.artifacts/phpstorm-reference/php-tests/` (`o02` gutter antes de rodar, `o05` classe executada com ⌃⇧R, `o06` popup ⌃⌥R, `o07` diálogo da configuração, `o08` falhas de comparação). O clique de mouse sintético não chegou à janela (sem permissão de acessibilidade para o injetor), então o menu do ícone do gutter, o seletor da barra superior e o diff "Click to see difference" **não** foram observados; tudo foi dirigido por teclado.
- Observado e reproduzido: ▶▶ na classe e ▶ nos métodos à direita dos números de linha (também um ▶ por linha de data provider — não reproduzido); depois de rodar, ícone de estado verde/vermelho com triângulo pequeno; configuração temporária "CalculatorTest" com ícone PHPUnit no widget; janela "Run" com aba da configuração e **uma barra horizontal** (Rerun, Rerun Failed, auto-test, Stop | Show Passed, Show Ignored | ordenar, recolher, histórico, ⋮); **Show Passed desligado** (pode ser preferência persistida da instalação); raiz "Test Results" selecionada ao terminar, com a saída completa; suíte "CLI Arguments" visível quando o runner a emite; linha de estado acima do console: "✗ 2 tests failed, 1 passed, 1 ignored" seguido, em cinza, de "3 tests total, 16 ms", e uma linha vermelha de progresso abaixo; console começa pelo comando e "Testing started at 11:01 ..."; ícone de teste com falha laranja na árvore; popup ⌃⌥R "Run" com "0 Edit Configurations…" e itens numerados "CalculatorTest (PHPUnit)"; diálogo com Name, Allow multiple instances, Store as project file, Test scope (Directory, Class, Method, Composite, Defined in the configuration file), Class antes de File, aviso "'XDebug' extension is not installed" sob o mecanismo de cobertura e "Error: Test class is not specified or invalid." no rodapé.
- Saídas reais dos runners: PHPUnit 11.5.57 e Pest 3.8 (PHP 8.3) instalados por `composer:2` em contêiner descartável sobre cópias das fixtures; cobertura com PHP 8.3 + PCOV em contêiner descartável. Nenhum banco/serviço real.
- Nenhum código, ícone ou asset da JetBrains foi usado; ícones são SVG próprios.

## 1. Run configurations

Critérios:
- DOC: campos *Test scope* (Directory, Class, Method, Defined in the configuration file; Pest: Directory, File, Test), *Use alternative configuration file*, *Test runner options*, *Preferred Coverage engine* (Xdebug, PCOV), *Interpreter*, *Name*, *Store as project file*.
- OBS: seletor no widget Run da barra superior ("Current File ▾", ▶, depurar).
- HIP: ação do gutter cria uma configuração **temporária** selecionada (ícone esmaecido), com até 5 temporárias; o popup do seletor lista configurações com ▶ ao passar o mouse, "Current File", "Save '…' Configuration" e "Edit Configurations…"; nomes `Classe::método`, `Classe`, `Arquivo.php::descrição`.
- REQ: salvas por projeto em `.php-ide/run-configurations.json` (escrita atômica pelo serviço nativo, link simbólico recusado, 1 MiB); temporárias nunca são gravadas; sem variáveis de ambiente (evita segredos em arquivo do projeto); opções reservadas ao plano (`--teamcity`, `--log-junit`, `--coverage-clover`, `--filter`, `--configuration`, `--colors`) recusadas no Rust.

Implementado: seletor substitui o rótulo/▶ do host enquanto o plugin está ativo (restaurados ao desativar); popup com teclado; diálogo "Configurações de execução/depuração" com árvore PHPUnit/Pest, +/−/copiar, formulário por escopo, validação mostrada sob o formulário ("Erro: …"), Executar/Cancelar/Aplicar/OK; popup ⌃⌥R "Executar" com mnemônicos; atalhos ⌃R (executar selecionada), ⌃⇧R (teste sob o cursor), ⌘R (rerun), ⌘F2 (parar, só com teste em execução — convive com `debug.stop`).

## 2. Ícones de resultado no gutter

- DOC: ícone Run no gutter de classes/métodos de teste; estado da última execução.
- HIP: ▶ por teste, ▶▶ por classe/describe; selo verde ✓, vermelho ✗ ou cinza – sobre o triângulo; menu "Run '…'", "Run '…' with Coverage", "Modify Run Configuration…". "Debug '…'" fica de fora até existir Debug Test (SPEC-13).
- REQ: estados persistem entre execuções e só são substituídos para os testes que rodaram; data sets agregam no método (pior estado); classe/describe agrega os filhos.
- Gutter compartilhado: o depurador (outra sessão) cria breakpoint em qualquer clique na margem de ícones. O plugin intercepta, na fase de captura do contêiner do editor, só os cliques sobre os próprios ícones (`.pt-gutter`), então o ▶ abre o menu de testes sem criar breakpoint. O harness verifica isso com o pacote do depurador carregado. Na referência os breakpoints ficam na área dos números de linha, não na de ícones — divergência do plugin do depurador, registrada para a sessão dele.

## 3. Janela Run

- DOC (*Test Runner tab*): barra lateral Rerun, Rerun Failed Tests, Toggle auto-test, Stop; barra de testes Show Passed, Show Ignored, Sort Alphabetically, Sort By Duration, Expand/Collapse All, Previous/Next Failed Test; árvore com raiz, suítes e testes com ícone de estado; duplo clique abre o teste.
- OBS: ver acima (barra única, estado "N testes falharam, M aprovados, K ignorados · T testes no total, X ms", raiz selecionada, "Testes iniciados às …", "CLI Arguments" quando emitida). HIP: `<Click to see difference>` abre diff Esperado × Obtido (DOC/PHPUnit; não observado).
- REQ: eventos TeamCity transmitidos em lotes durante a execução e a lista completa devolvida no fim como resultado autoritativo (a fila de eventos do host pode descartar); sem TeamCity, árvore final pelo JUnit; teste em execução quando o processo para vira "interrompido", nunca aprovado; caminhos `arquivo.php:linha` do projeto viram links; o nome abreviado da suíte de data set do Pest (`… → it su`) é substituído pelo nome do teste.
- Diff: editor de diferenças do Monaco (lado a lado, somente leitura) num diálogo modal.

## 4. Rerun Failed e auto-test

- DOC: "Rerun Failed Tests" repete os testes com falha; "Toggle auto-test" repete quando o código muda, com atraso configurável.
- REQ: PHPUnit usa a identidade exata (`/(?:Classe::método|Classe::método with data set "x")$/`), conferida no PHPUnit 11.5 real. Pest 3.8 não seleciona um data set isolado pelo filtro (verificado com `--list-tests` e filtros reais): o teste inteiro é repetido e o console avisa ("todos os data sets").
- HIP: atraso padrão 3 s; a opção "Set Auto Test Delay" ainda não existe (fixo).

## 5. Cobertura

- DOC: *Run with Coverage*; janela Coverage com "Element", "Class, %", "Method, %", "Line, %"; marcas verdes/vermelhas no gutter; mecanismo Xdebug/PCOV.
- REQ: `testEnvironment` (Rust) consulta `php -m`; sem driver, a execução não começa e o erro diz qual extensão falta; PCOV usa `-d pcov.enabled=1`, Xdebug `XDEBUG_MODE=coverage`; Clover vai para arquivo temporário fora do projeto (8 MiB). Classe coberta = ao menos um método executado.
- Limitações: sem contagem de execuções no hover (o Monaco 0.57 não expõe tooltip confiável para `linesDecorations`), sem percentuais na árvore Project, sem "Flatten packages"; janela Coverage acoplada embaixo (na referência, HIP: lateral direita); PHPUnit exige `<source>` no `phpunit.xml` (as fixtures ganharam a seção).

## 6. Pest: datasets e `expect()`

- DOC (Pest): datasets compartilhados em `tests/Datasets/*.php` e `tests/Pest.php`, datasets locais no arquivo; `expect($v)` → `Expectation`, `->not`, `->each`, `->and($outro)`, higher order (`expect($user)->name->toBe(...)`).
- Implementado: completar em `->with('…')` (qualquer argumento) com datasets locais e compartilhados; ir para a declaração (local tem prioridade); depois de `expect(…)->` lista métodos/propriedades do `Pest\Expectation` e do mixin **do pacote instalado em vendor/** com assinatura e tipo (`Expectation<int>`), sem `not`/`and`/`each` após `->not->`, e membros públicos do objeto (PSR-4) como higher order; hover em `expect` mostra `function expect(mixed $value): Expectation<T>`.
- Inferência de tipo: literais, `new Classe` (com `use`/namespace), variável atribuída antes, parâmetro tipado da closure. Sem inferência de retorno de chamadas, `uses()->in()`, expectativas customizadas (`expect()->extend`), snapshots ou inspeção de dataset inexistente.

## Validação (nossa IDE, não comparativa)

- Plugin: `npm test` = 15 testes TS (TeamCity real PHPUnit 11.5/Pest 3.8, Clover real, configurações, filtros de rerun, datasets/expect) + 8 testes Rust (plano/opções/configuração alternativa, persistência, streaming com runner falso, ambiente, cancelamento).
- php-ide: `scripts/check-php-tests-ui.mjs` — WebKit (Playwright) com Monaco/workbench reais, serviço nativo real por stdio e PHPUnit/Pest reais em cópias descartáveis; 47 verificações e capturas em `.artifacts/php-tests-ui/`. `src/tool-plugins-smoke.ts` e `tests/php-tests.test.ts` foram ajustados para a nova revisão (gutter em vez de CodeLens; completar/ir para dataset) e dependem do novo pin do plugin.
- Não executado: `npm run test:native` (janela Tauri) com o plugin novo — exige binário publicado e novo pin em `default-plugins.json`, feitos pela coordenação no release.
