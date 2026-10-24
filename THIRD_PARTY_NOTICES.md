# Componentes de terceiros

A base ativa usa Tauri 2/Rust, WebView do sistema, Monaco e Tokio. Os plugins externos incluem suas próprias dependências, como xterm.js, portable-pty e SQLx; os backends Rust vinculados à IDE continuam registrados no Cargo.lock. Cada dependência mantém sua própria licença e avisos; esses arquivos devem acompanhar a distribuição. O código próprio usa MIT. Os adaptadores/CLIs externos têm licenças e requisitos próprios.

A implementação Electron e suas dependências exclusivas foram removidas do fonte ativo. Seu registro histórico permanece no Git. Os avisos abaixo descrevem componentes utilizados ou referências documentais identificadas explicitamente.

- Monaco Editor: MIT, inclui codicons/recursos próprios e dependências com avisos próprios.
- Phpactor: MIT. PHAR baixado separadamente pelo setup, versão 2026.10.07.0; SHA-256 `b28bf6166e016d539fc2f2aec18ef918b12590e436a6f1ccbdf30b5bbdbdb16b`. O artefato distribuído recebe a correção local MIT `function-query-missing-record-v1` para verificar registro nulo antes de consultar referências. `scripts/patch-phpactor.php` valida a origem e registra o hash final em `phpactor.phar.patch.json`, incluído no pacote. Dependências internas do PHAR mantêm seus avisos.
- @xterm/xterm e @xterm/addon-fit: MIT; avisos e licenças dos pacotes devem acompanhar a distribuição.
- Codex CLI: executável externo instalado/autenticado pelo usuário; não redistribuído por este projeto. Uso do serviço depende da conta do usuário.
- Mermaid 11.17.2 and its bundled dependency notices now belong to the separately installed [Markdown plugin](https://github.com/phpforge-dev/plugin-markdown/tree/main/licenses); Mermaid is no longer a core dependency.
- Plugin Pest para IntelliJ/PhpStorm (`JetBrains/pest-intellij`, antes `pestphp/pest-intellij`): MIT, copyright Oliver Nybroe. Usado só como referência de escopo pelo README/CHANGELOG públicos ([recorte 15](docs/research/implementation-slice-15.md)); nenhum código ou asset foi copiado ou distribuído, então não há aviso de licença a reproduzir. PHPUnit e Pest não são distribuídos: a IDE executa os binários instalados pelo Composer no projeto do usuário.
- Imagens Docker: ferramentas externas de desenvolvimento/teste, não incorporadas ao código da IDE.

PhpStorm é produto/marca JetBrains. Nenhum componente proprietário, asset visual ou instalação de trial é distribuído. Referências documentais não transferem licença de recursos do produto. A avaliação de redistribuição deve acompanhar cada atualização das dependências e do empacotamento.


## jsdiff / diff 9.0.0

https://github.com/kpdecker/jsdiff — usado pelo plugin Git no diff de linhas do editor; o pacote preserva a licença BSD-3-Clause abaixo.

```text
BSD 3-Clause License

Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

```

## IntelliJ Platform New UI icons

Copyright 2000–2026 JetBrains s.r.o. and contributors (individual copyright years retained in each SVG). Selected icons from `JetBrains/intellij-community`, commit `d8c6714c7a3c110c56994d6b0f10814f902100e7`, under Apache License 2.0. Only files with an explicit Apache notice were imported. SVG files are unmodified. Sources and SHA-256 hashes: `src/assets/jetbrains-icons/manifest.json`; license and upstream notice are adjacent and included in the app bundle under `licenses/jetbrains-icons/`.

This software includes code from IntelliJ IDEA
Copyright (C) JetBrains s.r.o.
https://www.jetbrains.com/idea/

The PHP file badges in `src/assets/original-icons/` are original project artwork, under this project's MIT license. No PhpStorm product logo, splash art, proprietary PHP plugin assets or installed binaries were copied.

Os badges PHP de classe, interface, trait e enum em src/assets/original-icons/php-*.svg são desenhos próprios sob MIT. Não foram extraídos do PhpStorm.

## Browser language services

The separately installed [Web Languages plugin](https://github.com/phpforge-dev/plugin-web-languages) owns the JavaScript/TypeScript and Vue workers. They bundle TypeScript 5.9.3 (Apache-2.0), Volar 2.4.28 (MIT), Vue language tools 3.3.13 (MIT), Vue 3.5.44 declarations (MIT), and React 19.2.2 declarations from DefinitelyTyped (MIT). They use actual published open-source packages, independent of JetBrains products. Dependency licenses, notices and version manifest are retained under `licenses/web-language-services/` and shipped in the application resources. The collection also preserves licenses from the installed dependency closure; inclusion of a notice does not mean that dependency executes in the renderer.

## Fontes Inter 4 e JetBrains Mono (SIL OFL 1.1)

Empacotadas localmente em `src/assets/fonts/` (subconjunto latino em WOFF2, sem CDN), obtidas dos pacotes npm `@fontsource/inter@5.3.0` e `@fontsource/jetbrains-mono@5.3.0` (cópias sem modificação dos binários publicados por esses pacotes). Inter: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter). JetBrains Mono: Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono). Ambas sob SIL Open Font License 1.1; textos completos em `licenses/fonts/Inter-OFL.txt` e `licenses/fonts/JetBrainsMono-OFL.txt`. As fontes não são vendidas isoladamente e mantêm os nomes originais (sem Reserved Font Name). Hashes SHA-256 em `src/assets/fonts/SHA256SUMS`.

## YAML parser

Docker/Compose editor support bundles `yaml` 2.9.1, copyright Eemeli Aro, under the ISC license. It runs in the browser without a Node runtime.

```text
Copyright Eemeli Aro <eemeli@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.

```

## Windows path compatibility

`dunce` (1.x), used to simplify Windows verbatim paths for external tools, is licensed under CC0-1.0 OR MIT-0 OR Apache-2.0. This distribution uses the MIT-0 option. Source and license: https://github.com/kornelski/dunce.

## Pacotes de linguagem incluídos

Laravel, DotEnv, Docker, Bash e Prettier são pacotes mantidos em repositórios próprios na PHP Forge. A IDE distribui apenas seus metadados em `default-plugins.json`; os pacotes são instalados do GitHub com suas licenças. Docker inclui YAML (ISC) e Prettier inclui os avisos de Prettier, YAML e ignore. Os pacotes instalados rodam no worker de plugins.

## Formatting

The separately installed [PHP Formatter plugin](https://github.com/phpforge-dev/plugin-php-formatter) owns the independent PHP whitespace printer. It uses php-parser 3.7.0 (Glayzzle, BSD-3-Clause) for syntax/token validation, not for formatting rules. Its license is retained in licenses/formatting and shipped in application resources. The separately installable Prettier plugin bundles the versions recorded in the plugin repository’s versions.json; Prettier, YAML and ignore licenses accompany that package. No JetBrains PHP formatter implementation is included.
# SQL intelligence

The separately installed [Database plugin](https://github.com/phpforge-dev/plugin-database) owns SQL parsing, cursor suggestions and metadata resolution. It uses dt-sql-parser 4.5.1 (MIT), with antlr4-c3 3.3.7 (MIT) and antlr4ng 2.0.11 (BSD-3-Clause). Copyright/license texts are retained in `licenses/sql-intelligence/` and included in the application. SQL semantic resolution and database metadata integration are original plugin code. No proprietary SQL engine or completion component is included.

## External feature packages (IDE 0.2.13)

The twelve extracted packages retain their own source licenses and bundled dependency notices in their public repositories, listed in [the extraction record](docs/research/parallel-plugin-extraction.md). Older license collections retained in this host are supplementary notices. Git, terminal, Docker Services, agents, database and PHP intelligence supply pinned Rust libraries linked into the host build; their transitive dependency licenses still apply to the distributed binary. JavaScript UI/worker packages are downloaded separately with their licenses.
