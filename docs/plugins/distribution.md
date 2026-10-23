# Testar, empacotar e distribuir plugins

## Testes do autor

Use um projeto descartável. Para cada hook, verifique resultado positivo, ausência de resultado, texto não salvo, caracteres acentuados/emoji (offsets UTF-16), concessão parcial e dependência ausente. Confira mensagens úteis na tela Plugins, não somente ausência de exceção.

A partir da raiz da IDE:

```sh
node --import tsx --test tests/plugins.test.ts
npm run typecheck
npm test
```

A suíte usa o host compartilhado e o sandbox atuais, sem runtime Electron. O teste do exemplo usa os arquivos reais de `fixtures/plugins/todo-hints/`. Os testes Rust em `plugins::tests` cobrem manifesto, ZIP, consentimento e operações privilegiadas. Isso não é um teste de toda integração visual de plugins na janela Tauri.

Para validar a integração de sua extensão, execute `npm run dev` ou o aplicativo compilado, siga o [tutorial](getting-started.md), confira os recursos um a um, desative/recarregue e troque de projeto. O smoke nativo geral também não deve ser anunciado como cobertura de todos os hooks externos.

## Formato do pacote

A pasta deve conter plugin.json e o arquivo main. README, LICENSE e outros arquivos auxiliares podem acompanhar. Arquivos auxiliares não viram módulos importáveis nem existe API para ler arbitrariamente a pasta do plugin; compile dependências e recursos necessários no main. O instalador de pasta ignora .git/node_modules e rejeita symlinks.

Para gerar um ZIP do exemplo, na raiz da IDE, sem alterar seu código:

```sh
mkdir -p .artifacts/plugins
python3 - <<'PYZIP'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
source = Path('fixtures/plugins/todo-hints')
with ZipFile('.artifacts/plugins/example.todo-hints-1.0.0.zip', 'w', ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(source))
PYZIP
```

Instale o ZIP em **Aparência → Plugins… → Instalar .zip…**. O ZIP pode ter manifesto na raiz ou dentro de uma única pasta envoltória. O backend rejeita caminhos inseguros, symlinks, criptografia, Zip64 e CRC inválido; suporta entradas armazenadas ou deflate, limitado a 2.000 arquivos/20 MiB.

Instalar uma versão com o mesmo id substitui a pasta anterior no escopo do usuário. Não há rollback automático, marketplace, atualização automática nem assinatura de pacotes. Distribua versão, requisito mínimo, licença, README e a relação de permissões; conserve a versão anterior se precisar de reversão manual.

## Diagnóstico rápido

| Sintoma | Conferir |
|---|---|
| Não aparece na lista | Pasta correta, plugin.json na raiz, Recarregar, erro de manifesto |
| Aguarda consentimento | Decisão de ativação e presença de algum activation.files |
| Carregou, mas não contribui | detect, filtro de documento, provedor conectado ao host e precedência de outros plugins |
| PermissionDenied | Permissão declarada e efetivamente concedida; revisar na tela Plugins |
| Falhou ao carregar | Erro de sintaxe, imports/export/require indevidos, chamada única a ide.register |
| Interrompido | Hook travado ou acima do limite; reduzir trabalho e caches; depois Recarregar |
| Edição não aparece | Usuário: Recarregar; projeto: watcher/recarregar. Não há hot reload genérico de módulos |
| Rede não funciona | curl instalado, permissão network, URL HTTP(S), erro/timeout exibido |
| Sugestão não aparece em comentário | Solicitar Ctrl+Espaço e conferir se completeCode é chamado naquele tipo de documento |

Fontes para investigar: [gerenciador](../../src/plugin-manager.ts), [worker/ponte](../../shared/language/plugins/sandbox.ts), [backend](../../src-tauri/src/plugins.rs), [testes](../../tests/plugins.test.ts).
