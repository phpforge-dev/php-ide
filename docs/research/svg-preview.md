# SVG — fonte e imagem — 23/10/2026

## Requisito e referência

Requisito relatado pelo usuário: abrir SVG e alternar entre fonte e imagem renderizada, como no fluxo usado no PhpStorm. Sem nova observação local/comparação visual do produto nesta entrega. Implementação independente com Monaco XML e imagem do navegador.

A [documentação SVG como imagem](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image) descreve as restrições do contexto img: scripts/interação desativados e recursos externos limitados. Esse é o contexto utilizado pela IDE, sem inserir SVG fornecido pelo arquivo no DOM da aplicação.

## Uso

Abra um arquivo `.svg`. A barra oferece **Fonte**, **Fonte e imagem** e **Imagem**. O padrão inicial é dividido; a preferência de modo é lembrada separadamente de Markdown. ⌘/Ctrl+Shift+V alterna os três modos. O fonte tem realce XML.

A prévia acompanha alterações do buffer após 120 ms, sem salvar automaticamente. Oferece zoom, 100%, ajustar à área e fundo quadriculado/claro/escuro. O rodapé mostra dimensões intrínsecas e zoom. Dimensões originais são capturadas antes do redimensionamento, evitando a variação de naturalWidth de SVG no WebKit após zoom.

XML inválido remove a imagem anterior e apresenta erro recuperável com **Ver fonte**. Corrigir o buffer refaz a imagem. Trocar para PHP/Markdown restaura o layout apropriado; retornar ao SVG mantém o acesso ao modelo editável.

## Implementação e limites

`editor-preview-layout.ts` coordena um único container dividido para Markdown/SVG; cada visualizador registra modo, preview e barra. `svg-preview.ts` valida XML com DOMParser, serializa o elemento SVG e o carrega em img por data URI. Eventos assíncronos são conferidos contra modelo/versão para não publicar resultado antigo. Nenhum comando IPC novo ou backend Node foi introduzido; a CSP existente já permite imagens data.

O SVG do arquivo não é usado como innerHTML, iframe, object ou documento ativo. Scripts/event handlers do SVG não executam na interface. Doctype externo é removido da representação usada para a imagem; DTD interno/declarações de entidades são recusados. O fonte original não é reescrito. SVG sem xmlns pode ser normalizado apenas na cópia de exibição.

Prévia limitada a 2 MiB de texto; zoom manual de 10% a 800%, modo ajustar independente desse mínimo e dimensão exibida limitada a 16.384 px por eixo. Arquivos SVGZ não fazem parte do recorte. Recursos externos (imagens, fontes, folhas de estilo, use de outro arquivo) não são resolvidos pelo projeto; não há editor vetorial, navegação de forma para código ou editor XML semântico completo. Renderização segue o motor do navegador/WebView, não um rasterizador independente. Imagens incorporadas/inlined dependem das capacidades desse motor.

## Validação própria

- `npm run typecheck` e `npm run test:locales`: passaram (1190 traduções).
- `npm test`: 72 passaram, 5 ignorados; nenhuma nova lógica Rust nesta entrega.
- `npm run test:native -- --no-db --svg-only`: dois checks passaram na janela Tauri/WebKit. SVG: pixels inicial/alterado no buffer, ausência de escrita automática, XML inválido/recuperado, três modos, zoom 100%/ampliação/fundo, script isolado e volta ao editor PHP. Markdown: prévia, links, imagem local, diagramas e completion existentes passaram como regressão do container compartilhado.
- `node scripts/preview-svg.mjs` e `--light`: fixtures Chromium com API simulada; validações de XML/namespace/entidades e pixel da imagem passaram. Capturas inspecionadas nos dois temas: `.artifacts/svg-split-preview.png`, `.artifacts/svg-split-preview-light.png` e variantes `svg-image-preview*.png`. Não substituem a evidência nativa.

TOOL-SVG-PREVIEW-001: Em desenvolvimento / não validada comparativamente. Não há declaração de equivalência integral com PhpStorm.

Entrega 0.2.6: aplicativo e DMG gerados; `npm run test:packaged -- --no-db --svg-only` passou nos dois checks SVG/Markdown. A asserção existente de erro Mermaid usa a descrição acessível traduzida, mantendo a exigência da classe de erro visível. DMG verificado com hdiutil e SHA-256 atualizado.
