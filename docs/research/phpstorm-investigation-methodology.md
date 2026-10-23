# Investigação comportamental da IDE PHP

Data: 21/10/2026. Escopo desta entrega: método, catálogo, arquitetura proposta, fixture e primeiros ensaios. O código da IDE não foi iniciado. Os documentos estão neste checkout por ser o workspace solicitado; a IDE proposta é um produto separado do Meu Hinário e não reutiliza seu domínio de negócio.

## Evidência e estados

Classificar cada afirmação: **OBS** observação da UI; **DOC** documentação oficial; **SRC** leitura de código open source; **HIP** hipótese; **REQ** requisito escolhido para nossa IDE. Uma previsão não vira OBS por parecer plausível. Registrar divergências entre DOC e OBS, mantendo versão e condições de ambas.

| Estado do catálogo | Condição para entrar |
|---|---|
| Não investigada | Apenas escopo, referências ou perguntas; leitura documental isolada não encerra investigação |
| Investigada | Fluxo reproduzido na referência, estados/saídas registrados e limites conhecidos |
| Especificada | Investigação convertida em contrato testável, casos negativos, critérios e diferenças aprovadas no documento |
| Em desenvolvimento | Implementação independente em andamento, vinculada ao contrato |
| Implementada | Testes próprios passam; comparação com referência ainda não concluída |
| Validada | Casos comportamentais obrigatórios passam em ambas, no perfil declarado, e relatório comparativo está disponível |

Uma funcionalidade ampla permanece incompleta se apenas um subcaso passar. Criar IDs de subcaso para validar recortes, sem promover a família inteira. O estado de uma investigação documental pode avançar sem alterar o estado funcional.

## Ambiente e observação autorizada

- PhpStorm encontrado em `/Applications/PhpStorm.app`; usuário informou trial ativo e autorizou observação pela interface. A tela Welcome mostrou **2026.1.4**. A documentação pública consultada identifica **2026.2**: não tratá-la como prova do comportamento da versão instalada.
- Inicialmente a consulta de acessibilidade retornou `false`; depois da habilitação pelo usuário, retornou `true`. AppleScript/System Events é usado somente para interações e leitura da árvore pública de acessibilidade.
- Projeto sintético: [fixture](fixtures/php-intelligence/README.md). Abrir uma cópia descartável; nunca fazer os ensaios de Rename nos arquivos do produto.
- Não ler JARs, bytecode, índices internos, caches, implementações de plugins, tráfego ou recursos do bundle. Não usar modos internos, debugger do processo, instrumentação, descompiladores ou extração de código.
- Não coletar tokens/licença ou dados de projetos pessoais. Screenshots limitados à janela do ensaio; guardar fora do repositório e não distribuir como assets. Acessibilidade e captura de tela têm permissões diferentes; falha em uma não autoriza contorno.

## Ciclo por comportamento

1. Formular propósito e hipótese falsificável. Exemplo: a primeira completion em `$user->` não oferece método privado de User fora da classe.
2. Fixar fixture, hash, PHP language level, extensões, plugins, keymap, SO, escala, idioma, tema, estado do índice e opções de completion/refactoring.
3. Abrir cópia limpa, aguardar o estado visível de análise; registrar também a experiência durante indexação num ensaio separado.
4. Executar por menu/ação nomeada e depois por atalho real do keymap. Registrar posição do cursor, seleção, foco e buffers não salvos.
5. Registrar entradas, saídas textuais, destinos, candidatos ordenados e estados. Screenshot complementa; não substitui texto e coordenadas semânticas.
6. Variar uma condição por vez: símbolos homônimos, visibilidade, aliases, código incompleto, arquivo removido, dependência ausente, cancelamento, Unicode e edição não salva.
7. Repetir a partir da cópia limpa. Se o resultado variar, documentar frequência/contexto antes de fixar um golden.
8. Escrever especificação com positivos, negativos e expectativas desconhecidas. Diferenciar incompatibilidade desejada de bug.
9. Transferir somente especificação, fixture própria e fontes públicas licenciadas para a implementação. Sempre que possível, usar pessoa/agente distinto; esta entrega não alega separação formal de equipes já realizada.
10. Implementar um recorte, executar testes de domínio/protocolo e UI, comparar com o oracle externo e registrar diferenças.
11. Atualizar catálogo e matriz no mesmo conjunto de mudanças. Evidência ausente significa não validado, nunca aprovação implícita.

## Registro mínimo de uma execução

```json
{
  "run_id": "YYYYMMDD-platform-case-repeat",
  "case_id": "PHP-COMP-001-a",
  "kind": "OBS",
  "reference": {"version": null, "build": null, "os": null, "keymap": null},
  "fixture_sha256": null,
  "php_level": null,
  "plugins": [],
  "index_state": null,
  "settings": {},
  "steps": [],
  "observations": [],
  "artifacts": [],
  "result": "not_run",
  "limitations": [],
  "reviewer": null
}
```

`artifacts` registra caminho local, SHA-256, tipo, data e restrição de distribuição. `result`: `pass`, `fail`, `blocked` ou `not_run`. Ausência de resultado não é `pass`. Preservar saída original e normalizada; normalizar somente diretórios temporários, finais de linha e coordenadas por convenção documentada, nunca excluir erros ou candidatos divergentes.

## Milestones propostos

| Marco | Entrega verificável | Dependência e saída |
|---|---|---|
| M0 — pesquisa | Craft, REA, catálogo, arquitetura e fixtures | Esta entrega; observações incompletas ficam explícitas |
| M1 — oracle PHP mínimo | Seis roteiros iniciais repetidos, snapshots de texto/destinos e keymap local | UI autorizada e disponível; nenhuma implementação antes de fechar contratos do recorte |
| M2 — prova do motor | Mesmas fixtures em candidato LSP e alternativa de parser; erros e lacunas medidos | Escolher motor por resultados, licença e manutenção, não por lista de features |
| M3 — primeiro fluxo útil | Abrir projeto → editar → completion → navegar e voltar; preview de rename | Testes semânticos e ponta a ponta; cancelamento/undo; macOS e Windows |
| M4 — aprofundamento | PHPDoc/generics, vendor, stubs, indexação incremental | Ampliar só com novos casos e comparação; sem promessa de equivalência total |
| M5 — ferramentas | Composer/Git/testes/debug/frameworks, em fatias independentes | Perfis separados por plugin/runtime; prioridades do catálogo |

Tarefas futuras devem ter ID, fixture, contrato, dono, dependências, evidência e critério de saída. Não estimar prazo total da IDE a partir dos números Craft. Complexidade no catálogo é relativa, ainda sem benchmark ou equipe definida.
