# Plugins

O PHP IDE aceita plugins locais de terceiros com manifesto `plugin.json` e um arquivo JavaScript. Eles podem contribuir com sugestões, destinos de navegação, diagnósticos e CodeLens nos fluxos conectados ao host. O sistema ainda é experimental, sem SDK publicado ou compatibilidade com plugins JetBrains/VS Code.

## Instalar e usar

1. Abra um projeto e vá a **Aparência → Plugins…**, ou clique na lista de plugins do rodapé.
2. Escolha **Instalar de pasta…** ou **Instalar .zip…**.
3. Confira origem, descrição e permissões. A instalação não dispensa consentimento: a primeira ativação exige decisão mesmo sem permissões declaradas.
4. Verifique o estado e eventuais erros na tela Plugins. Use **Recarregar** após editar o pacote instalado.

A instalação pela interface vai para a pasta de plugins do usuário. Para um plugin exclusivo de um projeto, coloque a pasta em `.php-ide/plugins/<nome>/`, dentro daquele projeto. O consentimento de um projeto não é transferido para outro.

Na tela Plugins é possível ativar/desativar, revisar permissões e ver erros e acessos negados. Remover pela interface atende plugins do usuário; para remover um plugin do projeto, apague sua pasta e recarregue. Dependências não são instaladas automaticamente.

## Para autores

- [Primeiro plugin: tutorial executável](getting-started.md).
- [Manifesto, API e ciclo de vida](api.md).
- [Empacotar, testar e solucionar problemas](distribution.md).
- [Permissões e limites do isolamento](permissions.md).
- [Exemplo completo TODO Hints](../../fixtures/plugins/todo-hints/README.md).

Código que gera a API: [contratos](../../shared/language/plugins/api.ts), [adaptador/worker](../../shared/language/plugins/sandbox.ts), [host](../../shared/language/plugins/host.ts) e [backend Rust](../../src-tauri/src/plugins.rs). A API ainda acompanha a versão da IDE, sem uma versão de protocolo independente.

## Escopo atual

Plugins internos são módulos confiáveis compilados com a IDE; plugins de terceiros são pacotes carregados em workers. Não use as permissões ou importações dos internos como exemplo de um plugin instalável.

A lista de linguagens do manifesto é um filtro de documentos, não um mecanismo para registrar nova linguagem ou garantir cobertura de hooks em qualquer editor. PHP/Blade, Markdown e documentos específicos de Composer/Symfony têm integrações próprias. JavaScript/TypeScript/Vue usam serviços separados; declarar essas linguagens não conecta automaticamente o plugin ao autocomplete/diagnóstico deles. Ver [referência](api.md#integração-com-o-editor).

Não há marketplace, atualização automática, assinatura de pacotes, painéis personalizados, hover/rename/format para terceiros nem documentos virtuais fornecidos por plugins externos. [Registro técnico e evidências históricas](../research/implementation-slice-24.md).

## Vue.js e React

Os suportes de Vue.js e React já vêm incluídos e habilitados na IDE; não precisam de pasta/ZIP nem de plugin do marketplace. Consulte **Aparência → Plugins… → Suporte de linguagem incluído**. Ao abrir `.vue`, ativa-se o serviço Vue 3; `.jsx`/`.tsx` usam os serviços TypeScript/JavaScript para React. Os tipos do framework são usados quando encontrados nas dependências do projeto, com fallback offline incluído. Isso não instala Vue/React nem altera o package.json do projeto.

Para testar, abra um componente do projeto e use Ctrl+Espaço e F12; em TSX, erros de tipos também são apontados. Vue 2/Nuxt, tsconfig/jsconfig e aliases de paths têm limitações descritas em [serviços web](../research/web-language-services.md).
