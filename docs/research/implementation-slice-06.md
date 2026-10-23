# Recorte 06 — organização visual da IDE

21/10/2026. Motivação: o usuário identificou que a entrega anterior ainda estava muito distante do PhpStorm. A interface anterior mantinha dois painéis largos, botões grandes e formulários na área principal. Funcionalidades isoladas não satisfazem a experiência solicitada.

## Evidência e direção

**DOC:** [New UI do PhpStorm](https://www.jetbrains.com/help/phpstorm/new-ui.html), documentação 2026.2 consultada nesta etapa: widgets de projeto e VCS no cabeçalho, barras laterais de ferramentas, ferramentas abertas sob demanda, abas e navegação no rodapé. Essa documentação orienta a hierarquia, não comprova equivalência com o build local.

**OBS limitada:** a consulta pública de acessibilidade ao processo PhpStorm nesta etapa não retornou janelas. Não houve nova medição visual da referência nem extração de recursos. A avaliação das screenshots desta entrega é da nossa IDE, não uma comparação pixel a pixel.

## Mudança implementada

- Cabeçalho compacto com projeto, acesso a operações Git, voltar/avançar, salvar e aparência. A branch vem do serviço Git; não há configuração de execução fictícia.
- Barras de ferramentas nas duas bordas, com ícones SVG próprios, nomes acessíveis, tooltips e estado selecionado.
- Projeto e Git à esquerda; bancos e agente à direita. Clique na ferramenta ativa recolhe o painel; botão de ocultar preserva o conteúdo. O painel direito começa recolhido, dando espaço ao editor.
- Alt+1 alterna Projeto e Alt+9 alterna Git. Não são declarados como keymap completo do PhpStorm.
- Abas e ações de navegação compartilham uma faixa estreita. Caminho do arquivo fica no rodapé.
- Árvore mais densa, indicação do tipo de arquivo e seleção ativa. As cores/ícones são próprios.
- Grade de dados e Git recebem controles compactos; abas Dados/Estrutura mostram seleção. Fluxos existentes são preservados.
- Redimensionamento considera a largura das barras laterais. Layout suporta a janela mínima de 1000 px.

## Limites

Esta é uma revisão estrutural, não equivalência integral. Não há docking arbitrário, editor dividido, Search Everywhere, console SQL, log Git em grafo, execução/debug integrado nem índices equivalentes ao PhpStorm. O painel de dados permanece abaixo do editor; operações Git avançadas ainda usam diálogos próprios. Preferências de visibilidade dos painéis não persistem entre sessões.

## Verificação

Typecheck e build aprovados. Roteiro Electron de navegação e bancos aprovado após a mudança estrutural: cliques com modificador, histórico, abas, conexão PostgreSQL, árvore, grade, paginação, temas, fonte e resize. Screenshots clara/escura e janela 1000 × 700 revisadas. Alternar Projeto via Alt+1, recolher/reabrir Bancos e ausência de overflow horizontal da janela passaram. Regressão UI Git aprovada: diffs, staging, revisão/cancelamento/commit, histórico e retorno ao editor. Regressão PHP por F12, referências e implementações também aprovada, sem erros do renderer. A matriz de compatibilidade mantém as famílias sem validação comparativa.
