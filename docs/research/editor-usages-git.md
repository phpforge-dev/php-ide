# Usos de símbolos e Git no ponto de edição

Data: 2026-10-22. Base ativa: Rust + Tauri 2.

## Referência e separação de evidências

Requisito explícito do usuário: aproximar interface e comportamento do PhpStorm, incluindo navegar da declaração de um método para quem o chama e ver alterações Git naquele ponto.

Evidência **documental**, não observação da instalação local nesta rodada:

- [Search for usages](https://www.jetbrains.com/help/phpstorm/find-highlight-usages.html): busca semântica de usos e lista rápida para navegação.
- [Editor gutter](https://www.jetbrains.com/help/phpstorm/editor-gutter.html): marcas de alterações na margem e interação com o trecho.
- [Investigate changes](https://www.jetbrains.com/help/phpstorm/investigate-changes.html?keymap=macos): autoria de linhas por Git Blame.

Nenhum código, ícone ou componente proprietário foi extraído. A documentação pública descreve comportamentos; não comprova a implementação interna da referência. Interface própria com organização equivalente no recorte; paridade visual global não foi medida.

## Especificação e implementação do recorte

### NAV-USAGES-POPUP — usos a partir da declaração

- ⌘/Ctrl+clique no nome de uma declaração de classe, interface, trait, enum ou função/método abre a lista de usos. No local da chamada, continua abrindo a declaração.
- Menu contextual **Mostrar usos do símbolo**, botão Encontrar usos, Alt+F7 e ⌘/Ctrl+Alt+F7 abrem a mesma lista.
- Lista apresenta símbolo, quantidade, arquivo, linha e trecho. Resultados vêm do LSP, não de busca textual. Homônimos de classes não relacionadas devem ficar de fora.
- Filtro local por caminho e código; setas navegam; Enter abre; Esc fecha. Clicar em resultado abre a linha e preserva o histórico de retorno.
- Busca, ausência de resultados e falha têm estados visíveis. Mudar o documento invalida a lista pendente.
- Limites: resultados completos herdados do Phpactor; a indexação e inferência limitam a completude. Não há classificação de leitura/escrita nem árvore de hierarquia de chamadas. Não há Code Vision com contagem permanente.

### GIT-LINE-CHANGES — alterações junto às linhas

- Margem com verde para adição, azul para modificação e vermelho para remoção; exclusão se ancora na linha sobrevivente próxima.
- Comparação **HEAD → buffer atual**, incluindo mudanças preparadas, no disco e ainda não salvas. O popup informa a base explicitamente. Não confundir com comparação somente contra index.
- Clique na marca abre trecho anterior e atual. O menu **Git: mostrar alterações desta linha** oferece acesso sem clicar na faixa estreita.
- Troca de arquivo invalida consultas pendentes. Edição atualiza marcas com debounce; foco/consulta periódica atualiza a base após commits externos.
- Diff limitado a 100 ms/10.000 edições; erro de limite orienta usar painel Git. Texto e caminhos seguem os limites existentes de arquivo/IPC.
- Limites: não há preparar/reverter trecho neste popup; arquivos binários e casos que não tenham base válida não exibem marcas. Renomeações usam caminho anterior informado pelo Git.

### GIT-LINE-AUTHOR — autoria do ponto atual

- Menu **Git: autor e commit desta linha** consulta `git blame --line-porcelain -L n,n --contents -` com o buffer por stdin.
- Mostra autor, commit, data e mensagem; linha editada ainda não commitada recebe indicação própria. A consulta não salva nem modifica o buffer, arquivo ou index.
- Caminho confinado ao projeto, linha validada, execução sem shell e saída/tempo limitados.
- Limites: não há coluna permanente de annotations, navegação ao commit nem histórico completo de uma seleção. Arquivo novo sem histórico pode produzir erro Git recuperável.

## Aceitação e evidências

- Rust: teste específico cria repositório descartável, confere base HEAD, autor/mensagem, linha alterada em buffer, preservação do disco, arquivo novo e rejeição de caminho/linha inválidos.
- Janela Tauri: ir à declaração, ⌘+mousedown sintético abre usos; lista inclui chamada esperada e exclui homônimo; filtro e clique abrem a linha correta.
- Janela Tauri: editar buffer produz marca azul; mousedown sintético na marca abre diff com conteúdo; consulta de autoria distingue commit de alteração não salva; remover/adicionar linha produz respectivas marcas.
- O teste nativo usa eventos DOM sintéticos e ações do editor. Não comprova gesto físico do macOS ou comparação lado a lado com PhpStorm.
- `scripts/preview-workbench.mjs`: cliques Playwright e screenshots no Chrome com transporte simulado. `.artifacts/usages-preview.png` e `.artifacts/git-line-preview.png` são fixtures visuais, não evidência de servidor PHP/Git.

Estado das três funcionalidades: **Em desenvolvimento** na matriz de equivalência; recortes implementados e testáveis independentemente. Não promover família inteira como validada.


### Registro da execução

`npm run typecheck`, cinco testes Rust e os 13 grupos de `npm run test:native -- --no-db` aprovados. A extensão de testes encontrou uma falha de pintura: decoração presente no modelo sem marca renderizada após navegação no WKWebView. Atualização explícita do editor após recalcular decorações corrigiu o caso; adição, modificação e remoção passaram depois da correção.

| Recorte | Prioridade | Complexidade estimada | Dependências |
|---|---|---|---|
| NAV-USAGES-POPUP | Máxima | Média | Phpactor/LSP, índice PHP, modelos Monaco, navegação/histórico |
| GIT-LINE-CHANGES | Alta | Média | Rust/Git, jsdiff BSD-3-Clause, decorações Monaco, buffer atual |
| GIT-LINE-AUTHOR | Alta | Média | Rust/Git Blame, confinamento e processo limitado, buffer atual |

Sem testes de bancos nesta rodada; funcionalidades de banco não foram alteradas.

Pacote final aprovado: `node scripts/check-native.mjs --packaged --no-db`, 13 grupos, sem Vite. Relatório `.artifacts/native-packaged.json`.


### Correção de declarações de tipos — 2026-10-22

Relato do usuário: classes/interfaces/traits não abriam referências. Causa confirmada: o roteamento do gesto considerava apenas um prefixo `function` na mesma linha. Agora usa as declarações produzidas pelo analisador PHP para classes, interfaces, traits e enums; nomes em `new`, `implements`, `use Trait` e `::class` continuam como locais de uso e navegam para a definição. Funções/métodos toleram comentários e quebra de linha entre palavra-chave e nome.

`tests/php-navigation.test.ts`: duas provas de distinção entre declaração e uso, cobrindo quatro tipos, strings/comentários e método multilinha. Execução: `node --import tsx --test tests/php-navigation.test.ts`.

Roteiro Tauri acrescentado: `new Person` (alias) → classe `User` → referências; `implements Named` → interface → referências; `use HasId` → trait → referências; `State::Ready` → enum → referências. A lista abre por evento DOM com Meta e deve conter os arquivos consumidores. Fixture do enum em `fixtures/php-intelligence/src/State.php`. O gesto físico do sistema operacional e casos adicionais de inferência permanecem fora desta evidência.

Resultado da correção: typecheck, dois testes puros de navegação, cinco testes Rust e 14 grupos no aplicativo empacotado aprovados. O roteiro nativo inclui classes, interfaces, traits e enums com eventos DOM sintéticos. Relatório atualizado `.artifacts/native-packaged.json`.
