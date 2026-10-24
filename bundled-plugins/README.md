# Pacotes incluídos na IDE

Esta pasta contém cópias de versões publicadas dos plugins Laravel, DotEnv, Docker e Bash. A origem, o commit e o hash do JavaScript estão em `lock.json`. O fonte é mantido nos repositórios dos plugins; as cópias aqui permitem compilar e testar a IDE sem buscar código na internet.

`main.js`, `plugin.json` e as licenças são os pacotes distribuídos. Os testes TypeScript usam o snapshot de `src/`; os arquivos de `shared/language/plugins/` apenas reexportam esse fonte para manter os imports dos parsers e testes. A aplicação carrega os quatro plugins no worker e não instancia essas classes no host.

Para atualizar uma versão incluída, altere o commit e o hash em `lock.json`, execute `node scripts/sync-bundled-plugins.mjs`, confira o diff e rode os testes de linguagem, worker e janela nativa. O script só copia arquivos publicados; não executa o build dos repositórios baixados.
