# JavaScript, TypeScript, Vue e React — recorte independente

Requisito do usuário: suporte web integrado; Vue e React com a mesma prioridade. Entrega em 22/10/2026. Não foi realizado novo ensaio comparativo controlado com PhpStorm; os testes abaixo são da nossa implementação.

## Arquitetura e funcionamento

A base continua Rust + Tauri 2, sem backend Node. Monaco 0.57 usa seu worker TypeScript 5.9.3 para JavaScript/TypeScript e JSX/TSX. O build usa as entradas ESM publicadas do formatador HTML, porque as entradas UMD importadas pelo Vue deixavam uma referência a require no worker empacotado. O teste nativo detectou essa diferença em relação ao dev server. O roteamento agora separa os workers de TS, JSON, HTML e CSS; antes todos recebiam o worker genérico, que não fornece esses serviços. Vue 3 usa Volar/Monaco 2.4.28 e Vue language tools 3.3.13 em um worker local. Templates HTML, script setup, tipos, props e mapeamento para a posição original são processados pelo serviço open source.

As declarações oficiais React 19.2.2 e Vue 3.5.44 são incluídas como fallback offline. O projeto fornece suas próprias declarações quando encontradas nos pacotes selecionados em node_modules. Arquivos são lidos por IPC confinado ao projeto; o renderer recebe snapshots, não executa os scripts ou configurações do projeto. Não há busca de tipos em CDN. As declarações fallback podem ser abertas somente para leitura.

Ao abrir um arquivo web, carregam-se em segundo plano até 750 arquivos JS/TS/JSX/TSX/Vue e até 500 declarações dos pacotes selecionados. Limite agregado de oito milhões de unidades UTF-16; o status informa índice parcial quando o limite é atingido. Modelos abertos preservam o texto não salvo. Fechar uma aba mantém o snapshot para navegação entre arquivos; trocar projeto descarta os snapshots. Mudanças notificadas pelo watcher invalidam o índice; snapshots fechados de arquivos removidos são descartados, e o teste de ciclo de vida verifica que buffers abertos não são sobrescritos.

Autocomplete e diagnósticos funcionam no editor. F12, Cmd/Ctrl+B, Cmd/Ctrl+clique e Encontrar usos têm serviços web próprios. Implementações fica disponível para Vue e PHP; não há adaptação da API TypeScript para essa ação no toolbar. As declarações dos frameworks não são plugins JetBrains, nem tornam nossa IDE compatível com o marketplace deles.

## Critérios e evidências

Fixtures reproduzíveis em `fixtures/web-intelligence/`. `scripts/check-web-languages.mjs` executa os serviços reais em WebKit:

1. JavaScript: completar propriedade tipada por JSDoc. TypeScript: completar propriedade importada de outro arquivo, navegar à declaração e apontar atribuição string → number.
2. React: sugerir prop JSX tipada e apontar chamada incorreta ao setter inferido de useState.
3. Vue: completar expressão do template, navegar à declaração em script setup e apontar erro de tipo.
4. Vue: sugerir props declaradas em um componente .vue importado.

O mesmo roteiro aceita `--bundled-workers` para carregar o worker Vue de produção em WebKit, além da versão servida pelo Vite. Relatório: `.artifacts/web-languages.json`; captura: `.artifacts/vue-language-service.png`. `scripts/check-native.mjs --packaged --no-db --web-only` cobre os mesmos serviços instalados pela inicialização normal da janela Tauri, incluindo snapshots de arquivos fechados e navegação real pelo toolbar. O resultado nativo fica em `.artifacts/native-packaged.json` e deve ser lido antes de afirmar aprovação.

## Limitações conhecidas

- Não há sistema de instalação de plugins web ou compatibilidade com extensões JetBrains/VS Code.
- Vue 3 com template HTML é o recorte; Pug/Jade está desativado no browser. Nuxt, Vue 2, macros externas e linguagens de estilo avançadas não foram validados.
- TypeScript usa opções fixas nesta etapa: não carrega tsconfig/jsconfig, referências de projetos ou aliases paths. Isso limita monorepos e configurações próprias.
- Não há indexação irrestrita de node_modules; pacotes selecionados são React, Vue e seus tipos base. Symlinks que escapam à raiz continuam bloqueados pelo backend.
- Fallbacks tipados podem diferir da versão de framework do projeto, especialmente quando suas dependências não estão instaladas. Não inferir correção de todo o projeto por esses fallbacks.
- Autoimports, rename e todas as formas de referências entre template/script não têm suíte completa neste recorte; não declarar paridade ampla.
- JSX/TSX é tratado pelo serviço TypeScript. Componentes React escritos em JavaScript sem anotações dependem da inferência disponível; checkJs está desativado.
- Sem medição de desempenho em projetos grandes, validação Windows ou equivalência comparativa com PhpStorm.

## Fontes públicas

- [Monaco — integração ESM e workers](https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md)
- [Volar Monaco](https://github.com/volarjs/volar.js/tree/master/packages/monaco)
- [Vue language tools](https://github.com/vuejs/language-tools)

Licenças e notices dos pacotes estão preservadas em `licenses/web-language-services/`, também incluídas no aplicativo. TypeScript é Apache-2.0; Vue/Volar e as declarações React são MIT. Nenhum componente proprietário foi utilizado.

## Resultado da entrega

Typecheck, dois catálogos de idioma e 28 testes Rust passaram (um teste de banco real permanece ignorado por padrão). A regressão WebKit de seleção/cores PHP, multicursor, abas e busca geral passou. Os cinco cenários de linguagem e o ciclo de vida dos snapshots passaram em WebKit, inclusive com o worker Vue compilado para produção. O teste do aplicativo Tauri empacotado passou para TS/React/Vue, com navegação pelo toolbar e leitura real do projeto temporário. Esses resultados validam o recorte próprio, sem promover equivalência comparativa com PhpStorm.

## Disponibilidade e plugins — 23/10/2026

Vue.js e React são serviços incluídos/habilitados com o aplicativo. A tela Aparência → Plugins agora mostra cartões separados em **Suporte de linguagem incluído**, com ativação automática por `.vue` e `.jsx`/`.tsx`. Isso não cria pacotes de terceiros nem instala dependências no projeto; torna visível uma capacidade que já era inicializada por installWebLanguages. O catálogo de plugins ativos do host PHP continua separado desses serviços.

O aplicativo 0.2.6 existente passou em `npm run test:packaged -- --no-db --web-only` antes do ajuste da lista. Após o ajuste, typecheck, locales e 72 testes Rust passaram (5 ignorados); `npm run test:native -- --no-db --web-only` confirmou os dois cartões habilitados e o fluxo real TypeScript/React/Vue. O teste abre a tela Plugins e depois verifica props JSX, inferência de useState, props Vue importadas e navegação entre arquivos. Nenhuma dependência foi instalada em projeto externo. Os limites de Vue 3, tsconfig/aliases, snapshots e tipos fallback descritos acima permanecem.

Entrega 0.2.7: `npm run test:packaged -- --no-db --web-only` passou no release, incluindo cartões Vue/React e serviços reais. Aplicativo/DMG gerados, hdiutil verify válido e SHA-256 registrado.
