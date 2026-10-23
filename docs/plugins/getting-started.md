# Criar o primeiro plugin

Este tutorial usa o exemplo real [TODO Hints](../../fixtures/plugins/todo-hints/), já exercitado pelos testes do host. Não exige Node no runtime do plugin nem acesso a processos ou rede.

## 1. Preparar um projeto de teste

No terminal, a partir da raiz do repositório da IDE:

```sh
mkdir -p /tmp/php-ide-plugin-demo/.php-ide/plugins
cp -R fixtures/plugins/todo-hints /tmp/php-ide-plugin-demo/.php-ide/plugins/todo-hints
printf 'ana\nbruno\n' > /tmp/php-ide-plugin-demo/.todo-owners
printf '<?php\n// TODO(ana): revisar contrato\n// FIXME: tratar erro\n' > /tmp/php-ide-plugin-demo/demo.php
```

Abra `/tmp/php-ide-plugin-demo` na IDE. O projeto contém somente dados sintéticos. O exemplo permanece também em `fixtures/plugins/todo-hints`, sem alterações.

## 2. Entender o pacote

```text
todo-hints/
  plugin.json
  main.js
  README.md
  LICENSE
```

[plugin.json](../../fixtures/plugins/todo-hints/plugin.json) identifica `example.todo-hints`, exige IDE 0.2.0 e declara `project.read` para ler `.todo-owners`. PHP, Blade e Markdown são documentos de ativação. O [main.js](../../fixtures/plugins/todo-hints/main.js) chama `ide.register({...})` uma vez.

O arquivo é JavaScript comum, avaliado como corpo de função com `ide` injetado. Não use `export default`, imports de módulos ou `require`. Se escrever em TypeScript ou usar dependências, compile tudo previamente para um único `.js` autocontido, sem runtime Node.

## 3. Ativar e conferir o resultado

Aceite a ativação do exemplo e a leitura do projeto. Abra `demo.php`:

- `TODO` gera aviso; `FIXME` gera erro. As posições são calculadas a partir do texto recebido, incluindo alterações não salvas.
- O CodeLens no início do arquivo mostra a contagem. Clicar retorna um resumo na barra de status.
- Ao final de um comentário, digite `TODO(` e pressione **Ctrl+Espaço** para solicitar completion explicitamente: `ana` e `bruno` devem aparecer. Sugestões automáticas em comentários podem estar desativadas.

Se recusar apenas `project.read`, diagnóstico e CodeLens continuam funcionando; a leitura de responsáveis falha com `PermissionDenied`. Isso pode ser conferido na tela Plugins. Permissão de leitura inclui todos os arquivos acessíveis do projeto, não apenas `.todo-owners`.

Esses são resultados esperados do roteiro. Os hooks do exemplo têm testes automatizados no host; este tutorial não afirma uma execução automatizada completa na janela Tauri.

## 4. Criar sua variante

Copie o exemplo para uma pasta própria e altere `id`, nome e descrição. Use um identificador como `sua-equipe.todo-hints`, sem colidir com o exemplo. Modifique primeiro uma regra de diagnóstico e recarregue pela tela Plugins para conferir o efeito.

Um plugin mínimo, sem leitura de outros arquivos, pode declarar `permissions: []` e registrar apenas:

```js
ide.register({
  async diagnose(path, text) {
    if (!text.startsWith('<?php')) return [];
    return [{
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      message: 'Exemplo: documento PHP identificado',
      code: 'documento-php',
      severity: 'warning',
    }];
  },
});
```

Use `activation.languages: ["php"]` para essa variante. Os índices de linha/coluna são **zero-based**; `character` e offsets seguem unidades UTF-16, como strings JavaScript. `null` em completion/definition significa “não trato este ponto”; lista vazia significa “tratei, sem resultados”.

## 5. Testar e distribuir

Na raiz da IDE:

```sh
node --import tsx --test tests/plugins.test.ts
```

A suíte inclui o exemplo em worker, caminhos inválidos, permissões, resultados inválidos e falhas recuperáveis. Não é preciso rodar a IDE Electron. Para distribuir a variante, siga [empacotamento e verificação](distribution.md).
