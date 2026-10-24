# Marketplace e instalação pelo Git

A partir da versão **0.2.9**, abra **Aparência → Plugins…** para gerenciar os plugins.

## Procurar e instalar

Na aba **Marketplace**, pesquise pelo nome, autor ou pelo que o plugin faz. Clique em **Instalar** para baixar uma prévia. Confira o nome, a versão, o repositório, o commit e as permissões antes de confirmar. Depois da instalação, você escolhe quais permissões conceder para ativar o plugin.

A aba **Instalados** permite desativar, reativar, revisar permissões e remover plugins do usuário. A origem e o commit instalado aparecem junto ao plugin. Plugins guardados em `.php-ide/plugins` continuam pertencendo ao projeto e são removidos apagando sua pasta.

## Instalar pela URL de um repositório

Use **Instalar pelo Git…**, informe uma URL HTTPS e, se quiser, uma tag, branch ou commit. Se deixar o campo de versão vazio, a IDE usa o commit atual da branch padrão. Ela registra o commit exato que baixou.

O repositório precisa ter `plugin.json` e o JavaScript pronto na raiz. A IDE não roda `npm install`, scripts de build ou comandos fornecidos pelo repositório. Também não baixa submódulos. Git precisa estar instalado; esta primeira versão aceita repositórios públicos via HTTPS, sem autenticação interativa.

Se o ID já estiver instalado, a prévia informa qual versão será substituída. Um download ou manifesto inválido não remove a versão atual. O mesmo fluxo permite voltar a uma versão anterior informando sua tag ou commit.

## Atualizações e uso sem conexão

O botão **Atualizar catálogo** consulta a lista mais recente. Quando uma versão maior está disponível, o cartão oferece **Atualizar**. A atualização segue a mesma prévia e verifica se há novas permissões; não há substituição automática em segundo plano.

Se o catálogo não responder, a IDE mostra a última lista válida que conseguiu salvar, com um aviso. Plugins já instalados continuam funcionando sem conexão. Para instalar ou atualizar pelo Git, é preciso estar online. Pasta e ZIP continuam disponíveis para instalações locais.

## Onde ficam os plugins

O [repositório de catálogo](https://github.com/phpforge-dev/plugins) contém `catalog.json`. Os pacotes têm seus próprios repositórios:

- [Laravel e Blade](https://github.com/phpforge-dev/plugin-laravel)
- [.env](https://github.com/phpforge-dev/plugin-dotenv)
- [Dockerfile e Compose](https://github.com/phpforge-dev/plugin-docker)
- [Bash](https://github.com/phpforge-dev/plugin-bash)
- [TODO Hints](https://github.com/phpforge-dev/plugin-todo-hints)

Laravel, .env, Docker e Bash acompanham a IDE como pacotes prontos. Na primeira abertura, são instalados na pasta do usuário com a leitura do projeto já autorizada, como ocorria com os módulos internos que substituem. É possível revogar a permissão, desativar ou remover esses pacotes; eles não são reinstalados na abertura seguinte.

A sintaxe e a detecção dos tipos de arquivo continuam na IDE, assim como os serviços nativos de bancos, terminal e Docker. Vue/React, Composer, Symfony, Markdown, ignore e o executor de testes ainda têm integrações internas. Esta migração separa os quatro pacotes acima; não transforma todos os serviços da aplicação em extensões.

## Manter o catálogo

O formato tem `schemaVersion: 1` e uma lista `plugins`. Cada entrada contém `id`, `name`, `description`, `author`, `version`, `minIdeVersion`, `repository` e `revision`. A revisão do catálogo exige o hash completo de um commit, com 40 caracteres. A IDE confere ID, versão e commit após o download.

Para publicar, abra um pull request no repositório do catálogo. Os checks validam os campos e a revisão confere a origem e o pacote. O repositório de cada plugin deve manter seu build reproduzível e o `main.js` pronto para instalação.

O catálogo não aceita comandos de shell. Ele também não pesquisa repositórios aleatórios no GitHub: só exibe entradas publicadas na lista. A instalação pela URL permite usar plugins fora do catálogo.

## Validação

Esta é uma implementação própria, sem nova comparação de comportamento com PhpStorm ou VS Code. Os testes locais usam projetos sintéticos. O roteiro `npm run test:native -- --no-db --marketplace-only` testa o catálogo público e a instalação do TODO Hints pela URL real, em um perfil descartável; requer internet e Git. O smoke padrão continua sem depender do catálogo online. `test:native` compila a interface e usa um servidor de arquivos para testar o código de produção, sem hot reload. Isso evita que erros e recargas do servidor de desenvolvimento interfiram nos diálogos e nas edições do teste.

Os instaladores 0.2.8 não têm este recurso. É necessário compilar a versão 0.2.9 ou instalar um pacote dessa versão quando ele for publicado.

Na validação local em macOS, os dois caminhos de instalação do TODO Hints passaram na janela Tauri: URL Git e busca no catálogo, incluindo consentimento, desativação e remoção. Os builds dos quatro pacotes de linguagem também passaram nos seus próprios workflows do GitHub.
