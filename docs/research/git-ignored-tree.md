# Ignorados pelo Git na árvore — 23/10/2026

## Requisito e referência

Requisito do usuário: diferenciar arquivos e pastas ignorados visualmente como na referência de UX PhpStorm. A [documentação pública](https://www.jetbrains.com/help/phpstorm/adding-files-to-version-control.html) descreve nomes coloridos por estado VCS. Os tokens existentes `--ij-vcs-ignored` vêm da pesquisa anterior dos esquemas públicos Islands (`design/reference/islands/`). Esta entrega conecta o estado real a esses tokens; não representa comparação visual integral com uma instalação PhpStorm.

## Comportamento

Arquivos e pastas ignorados recebem a cor de ignorados do tema claro/escuro. Tooltip e descrição acessível informam Ignorado pelo Git. Ícones de tipo, foco, seleção e organização da árvore continuam disponíveis.

Pastas como node_modules, dist, target, .cache e .idea deixam de ser escondidas por nome na árvore. São carregadas apenas ao expandir: mostrar um diretório ignorado não implica percorrer suas dependências. .git, .tools e .php-ide continuam reservados à infraestrutura e não aparecem.

O Git decide o estado por `check-ignore --stdin -z`, incluindo regras aninhadas, negações, exclusões locais/globais e arquivos rastreados. Não há parser próprio de padrões: um arquivo já no index não é rotulado como ignorado apenas por corresponder a uma regra. Sem repositório/Git disponível, não se atribui uma cor de ignorado.

## Atualização e limites

O renderer consulta só caminhos visíveis, em lotes de até 1.000. MutationObserver cobre a carga preguiçosa de pastas; eventos do workspace/foco agendam a atualização com debounce de 180 ms. Um intervalo de 5 segundos com documento/árvore visíveis cobre mudanças de `.git/info/exclude` e operações externas que o watcher filtra. A atualização repinta os nós existentes, preservando expansão, seleção, foco e rolagem.

IPC gitIgnored valida a lista (até 10.000 caminhos e 1 MiB), confina caminhos ao projeto e usa entrada NUL para nomes literais, incluindo espaços/quebras de linha. Linhas já removidas do disco durante uma consulta são desconsideradas. A consulta é somente leitura. O limite existente da listagem de árvore permanece 2.000 entradas por diretório; symlinks continuam omitidos. Não acrescenta cores para todos os outros estados Git, nem implementa scopes/excluded roots da IDE ou comparação independente de repositórios aninhados.

## Evidência própria

- `npm run typecheck` e `npm run test:locales` passaram.
- `npm test`: 72 passaram, 5 ignorados. Três testes novos cobrem regras reais/negação, arquivos rastreados, herança em pastas, nomes com newline, info/exclude, alteração de regra, ausência de repositório, confinamento e visibilidade de diretórios antes ocultos.
- `npm run test:native -- --no-db --ignored-tree-only`: passou em janela Tauri com repositório sintético. Verifica cores distintas nos dois temas, descrição acessível, node_modules visível, filho herdando ignore e troca/restauração de regra sem perder expansão.

Estado comparativo: Em desenvolvimento / não validada. Não foram lidos arquivos de projeto externo nem acessados bancos reais.

Entrega 0.2.5: aplicativo/DMG gerados; `npm run test:packaged -- --no-db --ignored-tree-only` passou no release. DMG verificado com hdiutil e SHA-256 gerado.
