# TODO Hints (plugin de exemplo)

Instale em **Aparência › Plugins… › Instalar de pasta…** escolhendo esta pasta, ou copie-a para
`.php-ide/plugins/todo-hints` dentro de um projeto. Na primeira ativação a IDE pede consentimento
para a permissão `project.read` (leitura de `.todo-owners`). Sem ela, avisos e CodeLens continuam
funcionando e a completion de responsáveis recebe `PermissionDenied`.


## Desenvolver e distribuir

Este é o exemplo executável usado em `tests/plugins.test.ts`. O [tutorial](../../../docs/plugins/getting-started.md) mostra como copiá-lo para um projeto sintético, conferir diagnósticos/CodeLens/completion e criar uma variante. Consulte também [API](../../../docs/plugins/api.md), [permissões](../../../docs/plugins/permissions.md) e [empacotamento](../../../docs/plugins/distribution.md). O tutorial diferencia testes do host de validação na janela Tauri.
