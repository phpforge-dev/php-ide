# Instaladores Windows e Linux

O workflow [Windows and Linux installers](https://github.com/phpforge-dev/php-ide/actions/workflows/desktop-builds.yml) compila nos próprios sistemas pelo GitHub Actions. Windows usa MSVC x64 e produz NSIS `.exe`. Linux usa Ubuntu 22.04 x64 e produz `.deb` e `.AppImage` para manter uma base de glibc mais antiga.

## Gerar uma release

1. Sincronize a versão conforme o [guia de contribuição](contributing.md#1-atualizar-a-versao), valide o código e publique um tag `vX.Y.Z` com a release correspondente.
2. Abra **Actions → Windows and Linux installers → Run workflow** em `main` e informe o tag da release, por exemplo `v0.2.7`.
3. O workflow faz checkout do tag informado, verifica a versão, instala dependências de compilação, prepara Phpactor com checksum, roda typecheck, catálogos de tradução e testes Rust em cada sistema.
4. Após compilar, verifica a inicialização do aplicativo durante 15 segundos. No Linux instala o `.deb` no runner descartável e executa em Xvfb. No Windows executa o binário compilado.
5. Ambos os jobs devem passar antes do upload dos instaladores e seus SHA-256 na release existente. A página de downloads reconhece os pacotes automaticamente ao recarregar.

Via CLI autenticada:

```sh
gh workflow run desktop-builds.yml --repo phpforge-dev/php-ide -f release_tag=v0.2.7
gh run list --repo phpforge-dev/php-ide --workflow desktop-builds.yml
```

Os arquivos ficam também nos artifacts de cada execução. Para não substituir pacotes já entregues, o upload falha se um arquivo com o mesmo nome já existir na release. Investigue a falha; não remova arquivos públicos automaticamente. Alterações no código do aplicativo exigem uma nova versão/tag, preservando a origem dos pacotes publicados.

## Requisitos para usar

- Windows: arquitetura x64, WebView2 (o instalador NSIS usa o mecanismo padrão do Tauri para instalar o runtime quando necessário).
- Linux: arquitetura x64; `.deb` declara dependências do WebKitGTK/GTK. AppImage pode depender de FUSE 2; consulte a distribuição utilizada. Não equivale a suporte em todas as distribuições.
- Para inteligência PHP, PHP 8.2+ local ou Docker, conforme o README. Git e outras ferramentas externas precisam estar instalados para os recursos correspondentes.

## Limites da evidência

Build aprovado, testes Rust e permanência do processo aberto são evidências diferentes de um teste completo de interface. O smoke de inicialização não exercita edição, banco, Git, terminal, instalador Windows nem todos os recursos de linguagem. A verificação sintática Bash usa o shell Unix do sistema e fica indisponível no Windows quando não há o shell esperado. Não acessar bancos reais em verificações: usar somente fixtures e containers descartáveis.

Não há assinatura de distribuição Windows configurada neste workflow. Não há build ARM64 para Windows/Linux nem macOS Intel neste recorte. As notas da release devem registrar os resultados efetivos de cada execução.

Referências: [pipeline Tauri](https://v2.tauri.app/distribute/pipelines/github/), [pré-requisitos](https://v2.tauri.app/start/prerequisites/), [Debian](https://v2.tauri.app/distribute/debian/), [AppImage](https://v2.tauri.app/distribute/appimage/).
