# Recorte 05 — bancos, navegação e aparência

21/10/2026. Implementação própria, ampliando a experiência de desenvolvimento pedida pelo usuário. Este recorte não substitui a matriz de compatibilidade nem declara equivalência integral com o PhpStorm.

## Referência e limite de evidência

- **OBS:** na janela sintética do PhpStorm, View → Tool Windows listou Database e Database Changes; View também expôs Recent Locations, Recent Files e Recently Changed Files. A tentativa de abrir Database pela acessibilidade não produziu um painel verificável na árvore consultada. Nenhuma conexão real do usuário foi inspecionada.
- **DOC:** [Database tool window](https://www.jetbrains.com/help/phpstorm/database-tool-window.html) apresenta fontes/schemas/objetos em árvore, expansão e introspecção, busca e acesso a dados. O contrato próprio cobre a exploração inicial; não todos os recursos de DDL e SQL.
- **DOC:** [Source code navigation](https://www.jetbrains.com/help/phpstorm/navigating-through-the-source-code.html) descreve declaração por clique com modificador e histórico de posições. Keymaps variam; os atalhos do site não são evidência do keymap instalado.
- **DOC:** [New UI](https://www.jetbrains.com/help/phpstorm/new-ui.html) apresenta organização de ferramentas, temas e densidade. Nossos tokens, componentes e dimensões são próprios; não foram medidos nem extraídos do produto. Não há comparação pixel a pixel.

## Bancos

Fluxo: Bancos → adicionar conexão → expandir schema → escolher tabela/view → prévia de dados → Estrutura → próxima/anterior página. PostgreSQL, MySQL e MariaDB usam conectores existentes licenciados; Oracle, SQL Server e Redis continuam fora deste recorte.

`DatabaseBrowser` mantém configurações de conexão somente na memória do processo principal, com ID opaco no renderer. Senha é removida do formulário após conexão bem-sucedida; desconectar ou trocar de projeto elimina a configuração. Conexões de transporte são abertas por operação e encerradas após o uso. Não há persistência de credenciais, pool ou gerenciador de segredos.

Introspecção usa parâmetros para schema/tabela. Identificadores do SELECT são delimitados conforme o driver; offsets são números validados. Não recebe SQL arbitrário. Prévia roda em transação de leitura, retorna 50 linhas por página e consulta uma linha adicional para indicar próxima página. Usa chave primária quando disponível; sem chave, a UI informa que ordem/paginação podem variar. Mudanças concorrentes no banco podem alterar páginas mesmo com chave.

Limites explícitos: 128 colunas, 2.000 objetos por schema, offsets até 1.000.000, células exibidas até 512 caracteres (o servidor retorna um caractere extra para indicar truncamento). `NULL` é distinto de texto. Dados são prévias textuais; não exportação sem perda. Há timeout de consulta/conexão; não há botão de cancelamento do processo remoto. Conexões configuradas nesta sessão precisam ser recriadas após reiniciar.

Não há console SQL, edição de células, transações de escrita, DDL, foreign keys navegáveis, diagramas, filtros avançados ou autocomplete SQL. A ação “Estrutura” mostra nome, tipo, nulabilidade e chave primária. Erros não são tratados como tabelas vazias.

## Navegação

O motor continua Phpactor/LSP. Ctrl+clique (plataformas padrão), Cmd+clique no macOS, F12 e Cmd/Ctrl+B acionam declaração. Ctrl+clique adicional no macOS recebe tratamento próprio, preservando a opção solicitada pelo usuário. Isso não altera os limites semânticos do motor (generics e stubs externos continuam pendentes).

Histórico próprio guarda até 100 posições de origem de abertura/navegação, com voltar/avançar e Alt+setas. Abas preservam posição/rolagem; fechamento de aba modificada exige salvar, evitando descarte silencioso. Modelos carregados somente para referências não viram abas até serem abertos. O caminho completo relativo aparece como breadcrumb textual; ainda não é um menu de navegação de pastas.

Ainda faltam Search Everywhere, navegação por símbolos globais, arquivos recentes, última edição, reabrir aba fechada, split editor, atalhos por keymap e UI completa para escolher salvar/descartar/cancelar. Não há declaração de “indexação perfeita”.

## Design e estilo

Tokens CSS próprios para superfície, painel, borda, seleção, acento e texto; temas claro/escuro coerentes com o editor Monaco. Configurações de tema, densidade, fonte e larguras têm efeito imediato e persistem localmente sem dados de projeto ou senhas. Painéis laterais redimensionáveis por ponteiro ou teclado, com limites que preservam área do editor. Botões de fechar abas, estado de modificação, breadcrumb, grade com cabeçalho fixo e distinção visual de NULL fazem parte da experiência útil.

Não foram copiados fontes, ícones ou recursos visuais do PhpStorm. Ainda faltam tool-window bars completas, docking, disposição vertical/horizontal arbitrária, tema de sistema, perfis de keymap e avaliação de acessibilidade/contraste sistemática.

## Verificação

`scripts/check-databases.ts`: PostgreSQL 16, MySQL 8.4 e MariaDB 11.4 reais em containers próprios, portas locais efêmeras. Testa conexão/senha errada, schemas/tabelas/colunas/PK, páginas 1–50 e 51–55, NULL, valores longos, entradas inválidas e desconexão. Containers são removidos no finally.

`scripts/check-experience-ui.ts`: roteiro Electron com clique real no símbolo, histórico/abas, conexão PostgreSQL, árvore, dados/estrutura/paginação, tema/fonte e resize por teclado. Aprovado no Electron real/macOS: Cmd+clique e Ctrl+clique abriram User.php, voltar restaurou a linha 8 de probe.php, avançar retornou ao destino; abas, árvore, páginas 1–50/51–55, estrutura, NULL, senha removida, tema/fonte e resize por teclado passaram. Nenhum erro do renderer. Screenshots em `.artifacts/experience-light.png` e `.artifacts/experience-dark.png`, revisados visualmente. Testes próprios não validam a referência.

O ensaio revelou duas causas distintas: o teste calculava coordenadas antes do layout do Monaco estar pronto (corrigido aguardando renderização), e Ctrl+clique no macOS entrava no tratamento de menu contextual do editor. A captura do gesto no contêiner externo agora resolve a declaração antes desse tratamento. Não se exige hover prévio. O nome acessível das tabelas também foi explicitado para que o ícone decorativo não altere a identificação.

Typecheck/build aprovados; nove testes de arquivos/Git aprovados; regressão UI PHP (F12, referências e implementações) aprovada. Regressão UI Git aprovada: diff index/disco, staging, cancelar/revisar/confirmar commit, preservação de conteúdo, histórico e retorno ao editor. Build mantém aviso de bundle grande. Windows, desempenho em projetos grandes e validação comparativa continuam pendentes.
