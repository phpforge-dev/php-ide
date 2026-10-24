# Formatação — PHP próprio e plugin Prettier

Entrega experimental 0.2.10, 23/10/2026. Especificação independente baseada no requisito do usuário e nas interfaces públicas; não é uma cópia do formatador proprietário nem uma afirmação de paridade com PhpStorm.

## Uso

Use **Reformatar código** no menu contextual, paleta ou ⌘⌥L (macOS) / Ctrl+Alt+L. Com seleção, formata esse escopo; sem seleção, o arquivo. A paleta também oferece **Reformatar arquivo inteiro**. A aplicação modifica o buffer, sem gravar automaticamente, com undo em uma etapa. Se houver edição ou troca do documento durante a execução, o resultado é descartado. Não há format-on-save nesta entrega. As ações genéricas de formatação já existentes do Monaco podem continuar usando os serviços da linguagem; use a ação Reformatar código para este fluxo.

## PHP próprio

`shared/formatting/php.ts` contém o printer próprio de espaços, indentação e chaves. `php-parser` (BSD-3-Clause) fornece validação de sintaxe e tokens; não fornece as regras de formatação. O trabalho roda em worker, com limite de 4 segundos e arquivo de até 2 Mi unidades UTF-16. A saída só é aceita se mantiver AST e tokens significativos; strings, heredoc e comentários são preservados. Isso é uma barreira de segurança, não uma prova formal de equivalência semântica.

O recorte cobre declarações de classes/métodos, blocos de controle, espaços de operadores/parâmetros e arrays. Chaves de classe/método vão para a linha seguinte por padrão. Seleção aplica somente mudanças de espaços contidas integralmente no intervalo; não reconstrói o trecho como arquivo PHP separado.

Lê .editorconfig da raiz do projeto até a pasta do arquivo: indent_style, indent_size, tab_width, end_of_line, insert_final_newline, ij_php_class_brace_style e ij_php_method_brace_style (end_of_line ou next_line). Suporta seções com *, **, ? e grupos de extensões por chaves. Não busca configurações fora da raiz. Sem configuração, usa a indentação do modelo e chaves na próxima linha.

```ini
root = true

[*.php]
indent_style = space
indent_size = 4
end_of_line = lf
insert_final_newline = true
ij_php_class_brace_style = next_line
ij_php_method_brace_style = next_line
```

Limites: somente PHP puro; Blade/HTML misto é recusado. Não implementa todos os controles de Code Style, PSR-12/PER completos, alinhamento de colunas, ordenação de imports, rearranjo, wrapping por margem, formatação de SQL embutido ou sintaxe futura não aceita pelo parser. Não reescreve comentários/docblocks internamente. Casos em que as verificações detectam diferença são recusados, deixando o buffer intacto.

## Plugin Prettier

O [Prettier](https://github.com/phpforge-dev/plugin-prettier) tem build e testes no seu próprio repositório (`npm ci`, `npm run build`, `npm test`). A IDE instala o pacote pronto automaticamente do GitHub, em commit fixado, com leitura do projeto. Também pode ser instalado pelo Marketplace ou pela URL Git em Aparência → Plugins. O hook format atende JS/JSX, TS/TSX, Vue, JSON, HTML, CSS, SCSS, Markdown e YAML. PHP não passa por Prettier.

O pacote tem engine standalone incluído e fixado em versions.json; funciona offline, sem Node no renderer ou processos do projeto. Lê .prettierrc JSON/YAML, variantes .json/.yaml/.yml, prettier.config.json e a chave prettier de package.json. Procura a configuração mais próxima, aplica overrides relativos à pasta dela e lê .prettierignore na raiz. EditorConfig fornece indentação e fim de linha, sobrepostos pela configuração Prettier.

Não usa a versão instalada no node_modules do projeto, não executa configs JS/TS, não carrega shareable configs por nome nem plugins externos. Configurações executáveis e plugins adicionais geram erro explícito. O range do Prettier pode expandir até os limites sintáticos de uma construção, diferentemente do recorte PHP de espaços estritamente dentro da seleção. A permissão project.read é necessária para ler configuração; não há escrita ou acesso à rede pelo plugin.

## API e validação

O hook recebe texto completo, linguagem, indentação e range opcional e retorna texto completo. A ponte limita e valida o resultado; o editor calcula uma edição mínima e só aplica ao modelo/versão que originou a solicitação. Falhas não disparam outro formatador automaticamente.

- `npm run test:formatting`: printer, idempotência, AST/tokens, preservação de literais, seleção, configuração, Prettier real e pacote no sandbox.
- `npm run test:formatting:ui`: WebKit testa undo, readonly, edição e troca de modelo durante requisição.
- `node scripts/check-native.mjs --packaged --no-db --format-only`: instala plugin no projeto sintético, aceita consentimento e exercita PHP/Prettier na janela Tauri. Requer build atual e pacote do plugin preparado.

Relatórios ficam em .artifacts/formatting-ui.json e .artifacts/native-packaged.json. Testes próprios não validam equivalência com PhpStorm; não houve ensaio comparativo novo nesta entrega.

## Fontes públicas

- [JetBrains: Reformat code](https://www.jetbrains.com/help/phpstorm/reformat-and-rearrange-code.html) — formato do fluxo e seleção/arquivo.
- [JetBrains: Prettier](https://www.jetbrains.com/help/phpstorm/prettier.html) — integração externa distinta do formatter PHP nativo.
- [Prettier standalone](https://prettier.io/docs/browser) — engine no browser sem resolução automática de configuração/plugins.
- [php-parser](https://github.com/glayzzle/php-parser) — parser open source, separado do printer próprio.
