# Plugin Bash — 23/10/2026

## Requisito e referência

Requisito do usuário: suporte de linguagem para arquivos Bash. Referência documental pública: [manual GNU Bash](https://www.gnu.org/software/bash/manual/) e [invocação do shell](https://www.gnu.org/software/bash/manual/html_node/Invoking-Bash.html). Implementação independente; nenhuma observação comparativa do PhpStorm nesta entrega.

## Uso

Plugin Bash incluído na IDE. Reconhece `.sh`, `.bash`, `.bashrc`, `.bash_profile`, `.bash_login`, `.bash_logout`, `.bash_aliases`, `.profile` e scripts sem extensão com shebang Bash/sh (incluindo `#!/usr/bin/env -S bash`). Um shebang explícito de outro interpretador, como zsh/fish/Python, impede a análise Bash mesmo em `.sh`.

Ao abrir: realce de comentários, strings, comandos, variáveis e palavras reservadas pelo Monaco. Ctrl+Espaço sugere palavras reservadas/builtins, funções do arquivo em posições de comando e variáveis declaradas em expansões `$VAR`/`${VAR}`. F12/⌘ ou Ctrl+clique navega até declarações simples de funções e variáveis no arquivo. Hover fornece documentação curta dos builtins/palavras reconhecidos, sem mostrar valores de variáveis.

A sintaxe é verificada enquanto o buffer é editado; a correção remove o alerta. Não precisa salvar nem executar o script.

## Implementação e limites

BashPlugin no host existente; linguagem Shell do Monaco; índice léxico de declarações/referências simples no buffer atual. Comentários, strings simples, escapes e corpos de heredoc ficam fora das referências. O índice não implementa todos os escopos Bash, substituições aninhadas, funções dinâmicas, `eval`, arquivos carregados por source ou resolução de comandos externos. Declarações múltiplas, arrays e variáveis de laço não têm cobertura semântica completa. Não inclui formatação, ShellCheck ou execução/debug do script.

Sintaxe: comando IPC interno `shellValidate`, restrito à raiz do projeto. Rust envia o texto por stdin a `/bin/bash --noprofile --norc -n -s`; shebang `sh` e `.profile` usam `/bin/sh -n -s`. Executável/argumentos fixos, ambiente limpo (sem BASH_ENV/funções importadas), saída de comandos descartada e stderr convertido em mensagem genérica/linha, sem reproduzir conteúdo do script. Limite de 1 MiB e timeout de 3 segundos; kill_on_drop encerra o verificador no timeout. Não segue nem executa o caminho/flags indicados pelo shebang e não escreve o buffer em disco.

A gramática validada depende da versão do shell do sistema. No macOS, `/bin/bash` costuma ser 3.2; recursos sintáticos mais recentes podem precisar de uma evolução futura do verificador. `-n` não identifica todos os problemas de execução, programas ausentes ou erros de fluxo/valores. Avisos de heredoc dependem da versão do shell. Em plataformas sem `/bin/bash`/`/bin/sh`, realce e índice continuam disponíveis e o editor informa que a verificação nativa não está disponível. Não há suporte semântico específico a zsh/fish.

Detecção por shebang examina até 100 candidatos sem ponto no nome; arquivos com associação nominal são detectados diretamente. Reconhecimento não implica abrir um terminal ou executar script.

## Validação própria

- `npm run typecheck`: passou.
- `node --import tsx --test tests/bash-language.test.ts tests/docker-language.test.ts tests/dotenv-editor.test.ts`: 19 testes passaram, sendo 6 de Bash e regressões Docker/DotEnv.
- `npm test`: 69 testes Rust passaram, 5 ignorados. Três novos testes cobrem parser real, ausência de execução/escrita, confinamento, outros interpretadores, quotes/substituições/heredoc e buffer corrigido.
- `npm run test:native -- --no-db --bash-only`: passou na janela Tauri. Fixture sintética verifica ativação, realce, sugestões, F12 para função/variável, diagnóstico/remocão no buffer, `.bashrc`, script sem extensão e ausência do arquivo marcador que seria criado se o script executasse.

TOOL-BASH-LANGUAGE-001: Em desenvolvimento / não validada comparativamente. Evidência própria não comprova equivalência com PhpStorm ou cobertura integral de Bash.

Entrega 0.2.4: aplicativo e DMG gerados. `npm run test:packaged -- --no-db --bash-only` passou no aplicativo release; DMG verificado com hdiutil e checksum SHA-256 gerado.
