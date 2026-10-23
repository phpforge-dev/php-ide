# Recorte 14 — plugin Markdown: leitura, interpretação e prévia

22/10/2026. Pedido: implementar um plugin para leitura e interpretação de arquivos Markdown.

## Separação de fontes

- **DOC:** a ajuda pública do PhpStorm descreve suporte a Markdown com modos editor, dividido e prévia ([Markdown](https://www.jetbrains.com/help/phpstorm/markdown.html)). Usada só como referência de escopo.
- **OBS (22/10/2026, segunda rodada):** PhpStorm 2026.1.4, macOS, cópia descartável de `fixtures/markdown` (SHA-256 README `71a056e0…`, diagrams `c89ac1a1…`, guide `0ba5c76c…`). Só árvore de acessibilidade: a captura de tela **não** está autorizada para o terminal e não foi contornada. Ver tabela abaixo.
- Ordem de itens, atalhos e aparência da referência continuam **não** comparados.
- **REQ (próprio):** tudo abaixo. Âncoras seguem o formato público do GitHub (minúsculas, acentos mantidos, duplicadas `-1`, `-2`), não o da referência.

## Observação da referência (OBS)

| ID | Ação | Saída observada |
|---|---|---|
| OBS-MD-01 | Abrir `README.md` | Aba `README.md`, área `Editor for README.md` com o texto; barra de status `1:1`, `LF`, `UTF-8`, `4 spaces`; contador de problemas `1`/`1` acima do editor. Nenhum controle de prévia exposto na árvore de acessibilidade (possível barra flutuante ou WebView não acessível — não confirmado) |
| OBS-MD-02 | Find Action "markdown" | Ações e opções: Markdown Editor Floating Toolbar, Markdown Editor Actions, Markdown Editor Layout Actions, Export Markdown File To…, Import Word Document…, Configure Pandoc…, dobras padrão (code fences, front matter, links, table of contents, tables), Markdown Extensions:, Clean Up Markdown Extensions External Files…, Configure Markdown image |
| OBS-MD-03 | Mesma lista: inspeções | Incorrect table formatting, Incorrectly numbered list item, Links should not contain spaces, Outdated table of contents section, Table doesn't have side borders, Unresolved file references, Unresolved header reference, Unresolved link label |
| OBS-MD-04 | Find Action "editor and preview" com Markdown aberto | Editor and Preview, Preview, Sync scroll in the editor and preview, Sync Scroll, Increase Preview Font Size ⌘+ |
| OBS-MD-05 | Find Action "preview" | Também: Preview layout:, Preview font size:, Preview rendering engine: |

Terceira rodada (captura de tela autorizada pelo usuário em 22/10/2026; imagens guardadas fora do repositório, sem distribuição):

| ID | Ação | Saída observada |
|---|---|---|
| OBS-MD-06 | Abrir `README.md` | Layout padrão **editor e prévia** lado a lado. Três ícones na faixa das abas (somente editor, editor e prévia — ativo —, somente prévia); nenhuma barra extra. Destinos de links dobrados no editor (`[guia](...)`, `[g]: ...`), ícone de imagem na margem da linha `![Logo]`, contador de problemas ⚠1 ✓1 no canto do editor |
| OBS-MD-07 | Prévia do README | Títulos H1/H2 em negrito sem linha inferior; links em azul; imagem SVG local exibida |
| OBS-MD-08 | Abrir `diagrams.md` | Blocos ```` ```mermaid ```` exibidos como **código comum** na prévia, com barra de rolagem horizontal; bloco `php` com cores de sintaxe. Ícone de download na margem de cada bloco Mermaid |
| OBS-MD-09 | Ícone da margem do bloco Mermaid | Diálogo "Choose Plugins to Install or Enable" oferecendo o plugin **Mermaid 0.0.27+IJ.253 (JetBrains s.r.o.)**, categoria Programming Language. Cancelado (Esc); nada foi instalado |

Conclusão: na referência, Mermaid **não é embutido**; depende de um plugin separado. Na nossa IDE é embutido por pedido do usuário (REQ). O texto do aviso ⚠1 do README não foi lido: o clique de leitura caiu numa janela de outra instância da nossa IDE aberta por cima.

## Comparação lado a lado (mesma cópia da fixture, mesmo tamanho de janela)

| Aspecto | PhpStorm | Nossa IDE | Ação |
|---|---|---|---|
| Layout padrão | Editor e prévia | Editor e prévia (último modo lembrado) | Igual |
| Troca de modo | 3 ícones na faixa das abas | Antes: barra com botões de texto, seletor de títulos e contagem de palavras | **Ajustado**: 3 ícones na faixa das abas; barra extra removida |
| Títulos | Sem linha inferior | Tinham borda inferior | **Ajustado** |
| Código na prévia | Cores de sintaxe | Monocromático | **Ajustado**: `monaco.editor.colorize` com o tema ativo |
| Mermaid | Código comum + oferta de plugin | Diagrama SVG | Diferença intencional (REQ). Corrigido bug próprio: rótulos cortados ("Navegac") por medir texto com outra fonte; agora `htmlLabels: false` e tipografia isolada na figura |
| Links no editor | Destinos dobrados | Destinos visíveis | Não implementado (Monaco só dobra linhas inteiras) |
| Ícone de imagem na margem | Sim | Não | Não implementado |

Não observado: o conteúdo da prévia, o modo padrão de layout, a renderização de Mermaid (a opção "Markdown Extensions:" existe, mas não foi aberta) e o texto das mensagens das inspeções. A ação "Editor and Preview" não foi executada: Enter sintético no popup Java não a disparou. Durante a sessão o PhpStorm **reiniciou** (PID trocado, aba "What's New" aberta depois); a causa não foi identificada e não há indício de que tenha vindo das ações executadas. Os arquivos da cópia não foram alterados (hash conferido).

## Implementação

- `shared/markdown.ts`: parser próprio, sem dependências, para CommonMark usual + GFM (títulos ATX/setext, parágrafos, ênfase, código inline/cercado/recuado, citações e listas aninhadas, listas de tarefas, tabelas com alinhamento, links/imagens inline e por referência, autolinks, quebras). Cada bloco leva `data-line` com a linha de origem. Outline, âncoras, localização do link sob o cursor e resolução de caminhos relativos confinados ao projeto.
- Segurança: HTML bruto **nunca** é interpretado — blocos HTML aparecem como texto em bloco tracejado e tags inline são escapadas. Só `http`, `https`, `mailto` e caminhos relativos viram links; `javascript:`, `data:` etc. viram texto. Atributos sempre escapados.
- `shared/language/plugins/markdown.ts`: plugin interno `markdown` (oculto na barra de status). ⌘/Ctrl+clique e F12 em `[texto](destino)`, `[texto][ref]` e autolinks: abre o arquivo; `#âncora` vai ao título (aceita forma sem acento), `#L10` vai à linha. Completion após `](` sugere caminhos relativos (Markdown primeiro) e, após `#`, os títulos do arquivo alvo.
- `IdePlugin.documents(path)`: novo gancho opcional; o host só consulta um plugin para os documentos que ele atende (padrão: `.php`). Strings PHP não são analisadas em Markdown e Markdown não é enviado ao Phpactor.
- `src/markdown-preview.ts`: barra Editor / Dividido / Prévia (⌘/Ctrl+Shift+V alterna, modo lembrado), renderização ao vivo (120 ms), rolagem da prévia acompanhando o editor, duplo clique em bloco leva o cursor à linha, seletor de títulos, contagem de palavras e outline em ⌘/Ctrl+Shift+O. Links relativos da prévia abrem no projeto com histórico de navegação.
- Mermaid (pedido do usuário; OBS-MD-02 mostra extensões configuráveis na referência, sem confirmar Mermaid): blocos ```` ```mermaid ```` viram SVG na prévia. `mermaid@11.17.2` (MIT) é carregado sob demanda em `securityLevel: 'strict'` (rótulos sem HTML nem cliques; SVG sanitizado pelo DOMPurify do Mermaid), tema claro/escuro acompanhando Aparência, cache por código+tema. Diagrama inválido mostra a mensagem e mantém o código.
- Inspeções (nomes de OBS-MD-03; comportamento próprio): avisos no editor para arquivo inexistente ou fora do projeto, `#âncora` sem título (no próprio documento ou em outro Markdown) e `[texto][rótulo]` sem definição. Ignoram blocos de código, code spans, URLs externas e `#L10`. Novo método `textDocument/diagnostic` e gancho `diagnose` na API de plugins.
- Imagens: comando IPC `readImage` (Rust) devolve data URI de png/jpg/gif/webp/svg até 5 MB, com o mesmo confinamento de `read`. A CSP continua sem rede: imagens remotas aparecem como marcador com o texto alternativo.

## Verificação

- `tests/markdown.test.ts` (8 testes, `npx tsx --test`): blocos e linhas de origem, inline, segurança, âncoras/outline, links, navegação, completion e inspeções do plugin sobre `fixtures/markdown`.
- `npm test` (Rust, 8): inclui `preview_images` (MIME, base64, formato recusado, caminho fora do projeto) e confinamento de symlink também em `readImage`.
- `node scripts/check-native.mjs --no-db` na janela Tauri real: a verificação Markdown (prévia dividida, HTML escapado, imagem local, link relativo, completion, dois diagramas Mermaid — um em SVG, outro com erro — e aviso de arquivo inexistente) aprovada junto com as demais. Bancos não foram exercitados nesta execução.
- `npm run build:web`: Mermaid em chunks separados, fora do carregamento inicial.
- Captura da nossa IDE (build de desenvolvimento, `PHP_IDE_STATE_DIR` isolado) com a mesma cópia: README e `diagrams.md` conferidos após os ajustes; editor sem sobreposição de linhas. Uma janela do app empacotado (`release/bundle`, outra instância) exibiu linhas sobrepostas no editor de um `.md`; não reproduzido no build atual e não investigado no binário empacotado. Tema claro não conferido em captura.
- `npm run typecheck` aprovado.

## Limites

Não implementados: HTML bruto renderizado, notas de rodapé, matemática fora do Mermaid, destaque de sintaxe dentro dos blocos de código da prévia, imagens remotas, abrir URL externa no navegador (o link é copiado para a área de transferência), rolagem sincronizada da prévia para o editor, opção para desligar a rolagem sincronizada (OBS-MD-04), tamanho de fonte da prévia, exportação/Pandoc, dobras configuráveis, sumário (TOC) e as inspeções de formatação de tabela/listas/espaços em links. Mermaid: o build cresceu (~18 MB em `dist/assets`, carregado só quando há diagrama); aviso baixo do KaTeX conforme THIRD_PARTY_NOTICES. O parser cobre os casos comuns de CommonMark, sem garantir o conjunto completo da especificação (ex.: regras completas de delimitadores e entidades HTML). Aparência não comparada com a referência.
