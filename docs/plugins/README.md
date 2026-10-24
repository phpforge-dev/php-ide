# Plugins

Você pode pesquisar plugins no **Marketplace**, instalar pela URL de um repositório Git ou escolher uma pasta ou arquivo ZIP. Veja o [guia do Marketplace](marketplace.md). Cada plugin tem um manifesto `plugin.json` e código JavaScript, e pode adicionar sugestões, navegação, avisos de código e ações no editor (CodeLens).

O sistema de plugins ainda está em desenvolvimento. Ele tem uma API própria e não carrega extensões do VS Code ou do PhpStorm.

## Instalar e usar

1. Abra um projeto e vá a **Aparência → Plugins…**, ou clique na lista de plugins do rodapé.
2. Procure na aba **Marketplace** ou use **Instalar pelo Git…**, **Instalar de pasta…** ou **Instalar .zip…**.
3. Confira a origem, a descrição e as permissões. Na primeira ativação, a IDE pede sua autorização, mesmo que o plugin não solicite permissões.
4. Verifique o estado e eventuais erros na tela Plugins. Use **Recarregar** após editar o pacote instalado.

A instalação pela interface vai para a pasta de plugins do usuário. Para um plugin exclusivo de um projeto, coloque a pasta em `.php-ide/plugins/<nome>/`, dentro daquele projeto. O consentimento de um projeto não é transferido para outro.

Na tela Plugins é possível ativar/desativar, revisar permissões e ver erros e acessos negados. Você pode remover pela interface os plugins instalados na sua conta. Para remover um plugin que fica no projeto, apague a pasta dele e recarregue. Dependências não são instaladas automaticamente.

## Para autores

- [Primeiro plugin: tutorial executável](getting-started.md).
- [Manifesto, API e ciclo de vida](api.md).
- [Empacotar, testar e solucionar problemas](distribution.md).
- [Permissões e limites do isolamento](permissions.md).
- [Exemplo completo TODO Hints](https://github.com/phpforge-dev/plugin-todo-hints/blob/main/README.md).

Para consultar a implementação: [contratos](../../shared/language/plugins/api.ts), [adaptador/worker](../../shared/language/plugins/sandbox.ts), [host](../../shared/language/plugins/host.ts) e [backend Rust](../../src-tauri/src/plugins.rs). A API ainda acompanha a versão da IDE, sem uma versão de protocolo independente.

## O que os plugins podem fazer hoje

Plugins internos são módulos confiáveis compilados com a IDE; plugins de terceiros são pacotes carregados em workers. Não use as permissões ou importações dos internos como exemplo de um plugin instalável.

A lista de linguagens do manifesto é um filtro de documentos, não um mecanismo para registrar nova linguagem ou garantir cobertura de hooks em qualquer editor. PHP/Blade, Markdown e documentos específicos de Composer/Symfony têm integrações próprias. JavaScript/TypeScript/Vue usam serviços separados; declarar essas linguagens não conecta automaticamente o plugin ao autocomplete/diagnóstico deles. Ver [referência](api.md#integração-com-o-editor).

O Marketplace tem busca local no catálogo, instalação e atualização manual. Ainda não há atualização automática, assinatura de pacotes, avaliações, painéis personalizados, rename/format para terceiros nem documentos virtuais fornecidos por plugins externos. Plugins externos também podem fornecer hover e sugestões de correção por edição de texto. [Registro técnico e evidências históricas](../research/implementation-slice-24.md).

## Vue.js e React

Os suportes de Vue.js e React já vêm incluídos e habilitados na IDE; não precisam de pasta/ZIP nem de plugin do marketplace. Consulte **Aparência → Plugins… → Suporte de linguagem incluído**. Ao abrir `.vue`, ativa-se o serviço Vue 3; `.jsx`/`.tsx` usam os serviços TypeScript/JavaScript para React. Os tipos do framework são usados quando encontrados nas dependências do projeto, com fallback offline incluído. Isso não instala Vue/React nem altera o package.json do projeto.

Para testar, abra um componente do projeto e use Ctrl+Espaço e F12; em TSX, erros de tipos também são apontados. Vue 2/Nuxt, tsconfig/jsconfig e aliases de paths têm limitações descritas em [serviços web](../research/web-language-services.md).

O [plugin Prettier](https://github.com/phpforge-dev/plugin-prettier) pode ser selecionado na configuração inicial e também está disponível pelo Marketplace, Git, pasta ou ZIP. PHP puro usa o plugin PHP Formatter; nenhum plugin Prettier para PHP é carregado.

## Ferramentas PHP separadas (0.2.11+)

PHP/Xdebug, Composer e o executor PHPUnit/Pest são plugins próprios, com backend Rust fora do binário da IDE e interfaces fornecidas pelos pacotes:

- [PHP Debugger / Xdebug](https://github.com/phpforge-dev/plugin-php-debugger)
- [Composer](https://github.com/phpforge-dev/plugin-composer)
- [PHPUnit / Pest](https://github.com/phpforge-dev/plugin-php-tests)

Instale pelo Marketplace ou pela URL Git. Os pacotes recomendados podem ser baixados em segundo plano, mas **native.tool** e **workbench** exigem consentimento antes de iniciar. Eles executam código nativo com seus privilégios e código de interface na janela da IDE; são pacotes de confiança, diferentes dos plugins de linguagem isolados em worker. Desativar/remover encerra a ferramenta e retira sua interface; a edição PHP continua funcionando.

É necessário compilar/instalar a IDE 0.2.11 ou superior; versões anteriores não oferecem esse host. [Arquitetura, validação e limites](../research/native-tool-plugins.md).

## Markdown

[phpforge-dev/plugin-markdown](https://github.com/phpforge-dev/plugin-markdown) contains Markdown navigation, completion, diagnostics, heading outline, live preview, local images and offline Mermaid. Requires IDE 0.2.12. It is a default downloaded package, with explicit `project.read` + `workbench` activation; no native executable. The core keeps only file association and generic editor/plugin infrastructure. Markdown formatting remains the separate Prettier plugin.

## Configuração inicial e atualizações

A seleção de plugins na primeira abertura, a fila em segundo plano e as preferências de atualização estão descritas em [First-run and updates](../specs/first-run-and-updates.md). Auto update de plugins e IDE é desativado por padrão; avisos de novas versões continuam disponíveis.
