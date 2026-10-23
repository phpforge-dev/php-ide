# Referências PHP — registro de função ausente

Correção própria em 2026-10-22; sem observação comparativa do PhpStorm.

## Reprodução e causa

Na versão Phpactor 2026.10.07.0, `FunctionQuery::get` retorna `null` quando o índice não contém o registro. `referencesTo` chama `references()` nesse valor sem teste de nulidade. O mesmo padrão permanece no [fonte público consultado](https://github.com/phpactor/phpactor/blob/master/lib/Indexer/Model/Query/FunctionQuery.php). Não é evidência de que o índice inteiro esteja inválido.

A chamada direta a `referencesTo('missing_function')` com o índice em memória vazio reproduziu exatamente o fatal `Call to a member function references() on null` antes da correção. Depois da correção, retorna um gerador vazio. Um registro conhecido com referência continua retornando a localização; registro conhecido sem usos também retorna vazio.

## Implementação independente da IDE

É uma correção na dependência MIT distribuída, não uma captura genérica de erros no frontend. O guard foi adicionado somente a `FunctionQuery::referencesTo`: se o registro for nulo, encerra o gerador. Outros erros continuam propagando normalmente. Não há busca textual que confunda nomes homônimos, comentários ou strings.

`scripts/setup-php.mjs` continua validando a soma SHA-256 original e então executa `scripts/patch-phpactor.mjs`/`.php`. O patch recusa artefatos inesperados, altera uma única ocorrência, recompõe a assinatura de integridade do PHAR e registra versão, identificador do patch, hash original e hash final em `.tools/phpactor.phar.patch.json`. Esse manifesto acompanha o pacote Tauri. Reaplicação valida o hash final em vez de modificar novamente o arquivo. As licenças do PHAR permanecem e a alteração está registrada em `THIRD_PARTY_NOTICES.md`.

## Aceitação e evidências

- `php scripts/check-phpactor-query.php`: registro ausente, registro vazio, referência conhecida e hash do artefato.
- O mesmo teste aceita caminho do PHAR empacotado como argumento, incluindo diretório com espaços.
- Roteiro nativo `PHP: referências de funções, homônimos e registro ausente`: função global com chamadas em dois arquivos, função homônima chamada por nome totalmente qualificado em outro namespace, negativos em comentário/string, consulta de função nativa (`strlen`) e função inexistente em buffer modificado.
- `--references-only` no runner nativo permite executar o recorte isolado. A suíte geral continua incluindo o caso por padrão.

## Limite

Ausência de registro significa ausência de referências **conhecidas pelo índice**, não prova de que a função não é chamada em tempo de execução. Este patch não acrescenta inferência de chamadas dinâmicas nem reconstrói todo o indexador. O teste também revelou um falso positivo do motor para chamada homônima sem qualificação em outro namespace; a chamada totalmente qualificada foi distinguida corretamente. Esse limite de resolução não é tratado por este guard e não foi promovido a compatibilidade validada. Uma função sem definição pode ter chamadas indexadas e retorná-las normalmente; isso não é o mesmo que ausência de registro. Compatibilidade funcional com o PhpStorm continua **Em desenvolvimento**. A IDE precisa ser reaberta para substituir um servidor Phpactor já carregado na sessão anterior.

## Resultado final

Build/typecheck, 22 testes Rust e 23 grupos no pacote Tauri aprovados. O teste de query passou tanto no PHAR de desenvolvimento quanto na cópia empacotada; assinatura macOS e hash do manifesto verificados. O teste isolado de referências na janela Tauri também passou. A execução nativa usou `--no-db` e Docker sintético; não valida bancos ou engines reais.
