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
- [Exemplo completo TODO Hints](../../fixtures/plugins/todo-hints/README.md).

Para consultar a implementação: [contratos](../../shared/language/plugins/api.ts), [adaptador/worker](../../shared/language/plugins/sandbox.ts), [host](../../shared/language/plugins/host.ts) e [backend Rust](../../src-tauri/src/plugins.rs). A API ainda acompanha a versão da IDE, sem uma versão de protocolo independente.

## O que os plugins podem fazer hoje

Plugins internos são módulos confiáveis compilados com a IDE; plugins de terceiros são pacotes carregados em workers. Não use as permissões ou importações dos internos como exemplo de um plugin instalável.

A lista de linguagens do manifesto é um filtro de documentos, não um mecanismo para registrar nova linguagem ou garantir cobertura de hooks em qualquer editor. PHP/Blade, Markdown e documentos específicos de Composer/Symfony têm integrações próprias. JavaScript/TypeScript/Vue usam serviços separados; declarar essas linguagens não conecta automaticamente o plugin ao autocomplete/diagnóstico deles. Ver [referência](api.md#integração-com-o-editor).

O Marketplace tem busca local no catálogo, instalação e atualização manual. Ainda não há atualização automática, assinatura de pacotes, avaliações, painéis personalizados, rename/format para terceiros nem documentos virtuais fornecidos por plugins externos. Plugins externos também podem fornecer hover e sugestões de correção por edição de texto. [Registro técnico e evidências históricas](../research/implementation-slice-24.md).

## Vue.js e React

Os suportes de Vue.js e React já vêm incluídos e habilitados na IDE; não precisam de pasta/ZIP nem de plugin do marketplace. Consulte **Aparência → Plugins… → Suporte de linguagem incluído**. Ao abrir `.vue`, ativa-se o serviço Vue 3; `.jsx`/`.tsx` usam os serviços TypeScript/JavaScript para React. Os tipos do framework são usados quando encontrados nas dependências do projeto, com fallback offline incluído. Isso não instala Vue/React nem altera o package.json do projeto.

Para testar, abra um componente do projeto e use Ctrl+Espaço e F12; em TSX, erros de tipos também são apontados. Vue 2/Nuxt, tsconfig/jsconfig e aliases de paths têm limitações descritas em [serviços web](../research/web-language-services.md).
