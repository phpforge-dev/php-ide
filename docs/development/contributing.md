# Desenvolver e contribuir

Leia primeiro [AGENTS.md](../../AGENTS.md) e [estrutura do projeto](project-structure.md). UX faz parte da entrega: defina o fluxo, os estados de espera/erro, os atalhos e o resultado visível antes de considerar uma funcionalidade pronta.

## Ambiente e execução

Requisitos e setup estão no [README](../../README.md). A base obrigatória é Rust + Tauri 2, com frontend sem Node. Preserve alterações de outras tarefas e use projetos sintéticos para verificações; bancos reais e credenciais pessoais não são fixtures.

```sh
npm ci
npm run setup:php
npm run dev
```

## Validação proporcional

| Comando | O que verifica / requisitos |
|---|---|
| `npm run typecheck` | Tipos do código incluído no tsconfig |
| `npm test` | Testes Rust; testes marcados como ignorados não são executados |
| `npm run test:locales` | Catálogos e placeholders de tradução |
| `node --import tsx --test tests/plugins.test.ts` | Exemplo de plugin, host e sandbox; host compartilhado e sandbox atuais |
| `npm run test:web-languages` | Serviços web reais em WebKit; requer navegador Playwright instalado |
| `npm run test:native` | Compila e exercita janela Tauri via IPC; requer porta 1420 livre, Phpactor e Docker para bancos descartáveis |
| `npm run test:packaged` | Smoke no aplicativo já compilado; não recompila o pacote |

Não execute dois smokes nativos simultaneamente: compartilham portas e podem produzir interferência. Antes de repetir um teste que falhou, diferencie problema de ambiente de falha de comportamento. Não encerre processos do usuário para liberar portas.

Use `npm run check` para tipos (aplicação e testes), guarda de arquitetura, testes TypeScript/Rust, Clippy sem warnings e catálogos de tradução. Os testes exclusivos do runtime Electron foram removidos; o histórico permanece no Git. Testes unitários do worker não substituem uma verificação de segurança na WebView.

## Build e instalador macOS

Execute os comandos na raiz do projeto. Para o primeiro build, prepare o ambiente conforme o README (`npm ci` e `npm run setup:php`). É necessário macOS com ferramentas de desenvolvimento Apple e Rust/Cargo. O alvo padrão segue a arquitetura do host: no Apple Silicon, o DMG é `aarch64`, não universal.

### 1. Atualizar a versão

Antes de gerar uma nova entrega, mantenha a mesma versão nestes arquivos:

- `package.json`: campo `version`.
- `package-lock.json`: `version` do documento e de `packages[""]`.
- `src-tauri/tauri.conf.json`: campo `version`.
- `src-tauri/Cargo.toml`: `version` de `[package]`.

Exemplo desta entrega: `0.2.0` → `0.2.1`. Não substitua versões de dependências. Cargo atualiza a entrada do pacote `php-ide` em `src-tauri/Cargo.lock` ao compilar; inclua essa alteração na entrega. Usar um novo número também evita sobrescrever o DMG anterior.

### 2. Validar e gerar o pacote

```sh
npm run typecheck
npm test
npm run test:locales
npm run tauri -- build --bundles app,dmg
```

O comando Tauri executa o build web (incluindo typecheck), compila Rust em release e gera o aplicativo e o DMG. Aguarde sua conclusão com sucesso antes de testar ou distribuir. `npm run build` sozinho gera apenas o `.app`, conforme o script atual; para instalador, use explicitamente `--bundles app,dmg`.

Saídas para a versão 0.2.1 em Apple Silicon:

```text
src-tauri/target/release/bundle/macos/PHP IDE.app
src-tauri/target/release/bundle/dmg/PHP IDE_0.2.1_aarch64.dmg
```

A configuração atual usa assinatura local ad hoc (`signingIdentity: "-"`). O pacote não é notarizado pela Apple; o aviso de notarização ausente não significa falha na geração. Distribuição notarizada exige configurar assinatura e credenciais Apple pelo fluxo apropriado, sem incluí-las no repositório.

### 3. Testar o aplicativo empacotado

O smoke usa o `.app` já gerado, não recompila. Não reconstrua o pacote enquanto ele estiver sendo testado e não execute dois smokes simultaneamente.

Para o roteiro completo, com Docker disponível e bancos descartáveis:

```sh
npm run test:packaged
```

Para repetir o recorte de conexão/importação Laravel validado na entrega 0.2.1, sem banco real:

```sh
npm run test:packaged -- --no-db --database-only
```

Esse recorte verifica o diálogo e a importação/cancelamento usando `.env` sintético e IPC real. Não comprova conexão com servidores nem substitui o roteiro completo. Confira `ok: true` e `failures: []` no relatório `.artifacts/native-packaged.json`; cada execução substitui esse relatório.

### 4. Verificar o DMG e gerar checksum

Atualize o nome abaixo para a versão e arquitetura que acabou de compilar:

```sh
hdiutil verify "src-tauri/target/release/bundle/dmg/PHP IDE_0.2.1_aarch64.dmg"
```

O resultado deve indicar checksum válido. Para criar e conferir o arquivo SHA-256, execute em um subshell, mantendo a pasta original do terminal:

```sh
(
  cd src-tauri/target/release/bundle/dmg || exit 1
  shasum -a 256 "PHP IDE_0.2.1_aarch64.dmg" > "PHP IDE_0.2.1_aarch64.dmg.sha256"
  shasum -a 256 -c "PHP IDE_0.2.1_aarch64.dmg.sha256"
)
```

A integridade do DMG e o checksum não substituem os testes do aplicativo.

### 5. Entregar e instalar

Entregue o `.dmg` e, opcionalmente, seu `.sha256`, identificando versão, arquitetura e verificações realizadas. Para atualizar: feche a IDE, abra o DMG, arraste **PHP IDE** para **Aplicativos** e confirme a substituição da versão anterior. Abra a cópia em Aplicativos e ejete o DMG.

Na entrega 0.2.1: build concluído, DMG verificado, 66 testes Rust passaram (5 ignorados) e os dois checks de banco no aplicativo empacotado passaram. O teste completo com bancos não foi executado nessa geração do instalador.

## Critério de entrega

Documente o comportamento e os limites, rode tipos/Rust e verificações pertinentes à mudança. Para plugins, siga também o [roteiro de testes e distribuição](../plugins/distribution.md). Atualize o [catálogo](../research/phpstorm-feature-catalog.md) e a [matriz](../compatibility/phpstorm.md) quando a cobertura funcional mudar. Não promova compatibilidade por existir um botão nem por passar apenas um teste próprio.

## Configurações de ambiente

Normalmente, a IDE reabre o último projeto disponível. Para iniciar em outra pasta, defina `PHP_IDE_PROJECT`. Se não houver um projeto recente, ela usa o projeto de demonstração incluído.

Estas variáveis ajudam quando as ferramentas estão instaladas fora dos caminhos habituais:

| Variável | Uso |
|---|---|
| `PHP_IDE_PHP_BIN` | Caminho do executável PHP local. |
| `PHP_IDE_TOOLS` | Pasta das ferramentas usadas pela IDE. |
| `PHP_IDE_CODEX_BIN` | Caminho do executável Codex. |
| `PHP_IDE_ACP_AGENT` | Configuração do agente ACP externo. |

Instale e autentique as CLIs dos agentes antes de usá-las. O cliente ACP permite revisar alterações; o cliente Codex app-server está limitado a consultas de leitura. O adaptador Claude é externo e pode precisar de Node (`npm run setup:acp`). Não coloque senhas ou tokens na configuração dos agentes.

## Teste nativo com interface compilada

`npm run test:native` compila a interface e o backend antes de abrir a janela Tauri em um projeto temporário. A interface é servida pelo modo preview do Vite, sem hot reload. O teste do catálogo público fica separado por precisar de internet: `npm run test:native -- --no-db --marketplace-only`. Para executar o runner diretamente com a interface de desenvolvimento, use `node scripts/check-native.mjs --no-db`; ele mantém os logs do Vite nos erros de timeout.
