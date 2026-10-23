# Página pública e downloads

O site em `website/` é independente do aplicativo. HTML/CSS/JavaScript estáticos são publicados no GitHub Pages pelo workflow `.github/workflows/pages.yml`. A autoria do site é Jeidison Farias. Não há serviço próprio nem credenciais no navegador.

Publicação: [phpforge-dev.github.io/php-ide](https://phpforge-dev.github.io/php-ide/). Repositório: [phpforge-dev/php-ide](https://github.com/phpforge-dev/php-ide). A conta `jeidison` é proprietária da organização. Plugins são distribuídos em [phpforge-dev/plugins](https://github.com/phpforge-dev/plugins).

## Publicar

1. Publique o projeto no repositório da organização. Para GitHub Free, use um repositório público para hospedar no Pages.
2. No GitHub, abra **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Envie os arquivos do site para `main`, ou execute **Actions → Project website → Run workflow**.
4. O job mostra o endereço publicado. Para um repositório de projeto, normalmente é `https://ORGANIZACAO.github.io/REPOSITORIO/`.

O workflow injeta `GITHUB_REPOSITORY` automaticamente. Não precisa trocar URLs no HTML ao escolher a organização. Publica somente os arquivos estáticos explicitamente copiados pelo script; código da IDE, fixtures e artefatos de build não entram no site.

## Disponibilizar instaladores

Crie uma release no mesmo repositório e anexe os instaladores efetivamente gerados e testados. Consulte [o guia de build](contributing.md#build-e-instalador-macos). A página consulta as 30 releases mais recentes via API pública, escolhe a primeira estável ou, se nenhuma existir, a primeira prévia. **Todos os downloads exibidos pertencem à mesma release**; não mistura versões antigas para preencher plataformas ausentes.

| Sistema | Arquivos reconhecidos | Arquiteturas nos nomes |
|---|---|---|
| macOS | `.dmg` | `aarch64`/`arm64`, `x64`/`x86_64`, `universal` |
| Windows | `.exe`, `.msi` | `x64`/`x86_64`/`amd64`, `arm64`/`aarch64`, `x86`/`i686` |
| Linux | `.AppImage`, `.deb`, `.rpm` | `amd64`/`x86_64`, `arm64`/`aarch64`, `i686` |

Use nomes como `PHP.IDE_0.2.7_aarch64.dmg`; sem arquitetura reconhecida, o botão orienta consultar a release. Arquivos `.sha256` não viram botões de instalador: ficam acessíveis por **Todas as versões**. Nunca renomeie um pacote de uma arquitetura para outra.

Sem instalador, o cartão informa **Aguardando publicação**. Erros de rede/limite da API mostram **Tentar novamente** e o link de releases continua acessível. Novos instaladores anexados à release aparecem após recarregar a página, sem redeploy. A consulta depende de releases públicas; não coloque tokens no site para acessar repositórios privados.

## Prévia local

```sh
node scripts/build-pages.mjs
python3 -m http.server 4178 --bind 127.0.0.1 --directory .artifacts/pages
```

Abra `http://127.0.0.1:4178`. Sem repositório, a página mostra o estado anterior à publicação. Para consultar releases públicas existentes, gere novamente com `PAGES_REPOSITORY=organizacao/repositorio node scripts/build-pages.mjs`. O valor de configuração contém apenas o nome público do repositório.

## Evidência e limites

Verificação da página: `node scripts/check-pages.mjs` (requer Chromium do Playwright; alternativamente `PLAYWRIGHT_CHANNEL=chrome` usa Chrome instalado). Exercita respostas sintéticas de releases, arquiteturas, prévias, ausência de instaladores, erro/repetição da consulta e layout móvel. Não publica pacotes nem comprova execução da IDE em outros sistemas.

Página própria, sem inferência de compatibilidade com PhpStorm. O editor da apresentação é uma ilustração em HTML, identificada como tal. O workflow publica a página; **não compila instaladores**. A release 0.2.7 disponibiliza o DMG macOS Apple Silicon e seu SHA-256; Linux, Windows e macOS Intel dependem de builds e validações próprios antes da distribuição.

Referência: [workflow oficial do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
