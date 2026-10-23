# Ícones de arquivos e pastas — 2026-10-22

## Fonte, licença e independência

A JetBrains publica os ícones da IntelliJ Platform em [intellij-community](https://github.com/JetBrains/intellij-community/tree/d8c6714c7a3c110c56994d6b0f10814f902100e7/platform/icons/src/expui). A [orientação oficial](https://blog.jetbrains.com/platform/2024/08/more-new-ui-icons-for-your-plugins/) informa que a maioria dos ícones possui licença Apache 2.0 explícita. Isso não equivale a uma autorização genérica para todos os assets ou para o código proprietário do PhpStorm.

Foram importados **58 SVGs sem modificações**, exclusivamente com declaração Apache 2.0 no próprio arquivo, do commit `d8c6714c7a3c110c56994d6b0f10814f902100e7`. O importador `scripts/vendor-jetbrains-icons.py` registra caminho de origem, commit e SHA-256 no manifest; os hashes foram conferidos após a importação. Copyrights originais preservados; licença, notice e manifest acompanham o pacote em `licenses/jetbrains-icons/`, além de `THIRD_PARTY_NOTICES.md`.

`language/php.svg` não possui a mesma declaração explícita; não foi importado. Os badges PHP claro/escuro são desenhos originais deste projeto (MIT), não logotipos oficiais. `nodes/logFolder.svg` e sua variante também foram excluídos pelo importador por ausência do cabeçalho. Nenhum arquivo da instalação licenciada, JAR, logo de produto ou splash proprietário foi extraído. Foi consultado somente o código público necessário aos ícones.

## Aplicação e critérios

ID **UI-FILE-ICONS-001**. Prioridade alta, complexidade baixa. Recorte implementado; equivalência visual global permanece **Em desenvolvimento**.

- Árvore e abas usam SVGs de 16×16 com variantes que acompanham a preferência clara/escura imediatamente.
- Arquivos: PHP/PHTML, JSON, JavaScript, TypeScript, CSS e derivados, HTML, Markdown, YAML, XML, SQL, shell, TOML, CSV, imagens, arquivos compactados, configuração e fallback genérico.
- Pastas: pasta comum e convenções visuais `src`/`app`, `tests`/`test`, `vendor`, `resources`/`assets`/`public` e `.github`.
- A associação de pastas é uma convenção visual por nome; **não altera indexação nem configura source roots**. Não representa descoberta semântica de classes/interfaces/traits PHP. Vue e extensões não mapeadas usam fallback.
- Chevron separado do ícone, indentação consistente, rótulo com ellipsis. Imagens são decorativas (`aria-hidden`, alt vazio), nomes continuam como texto e os nomes acessíveis dos arquivos foram preservados.
- Foram removidos os pseudoelementos com letras/losangos para evitar ícones duplicados. O novo componente não lê todos os arquivos nem inicia análises adicionais.

Aceitação: variantes carregam sem imagens quebradas; ausência do antigo P/losango; ícone consistente na árvore/aba; seleção e abertura continuam operantes; troca de tema imediata; licença e origem verificáveis no bundle.

## Verificação

Typecheck aprovado e 21 testes Rust aprovados. Preview do workbench verificou carregamento dos SVGs, largura natural de 16px, remoção do antigo pseudoelemento PHP e mudança ao tema claro. Imagens de revisão em `.artifacts/workbench-preview.png` e `.artifacts/file-icons-light-preview.png` usam transporte simulado no Chrome; não são screenshots do PhpStorm. Não houve inspeção local do PhpStorm nesta sessão nem comparação de todos os tipos de arquivo com a versão instalada.

Arquivos centrais: `src/file-icons.ts`, `src/assets/jetbrains-icons/`, `src/assets/original-icons/`, integração na árvore/abas em `src/main.ts` e CSS em `src/workbench.css`. Nenhuma dependência de produção adicionada.

A regressão geral do pacote concluiu 17 grupos e registrou duas falhas no roteiro de navegação por clique (método/autocomplete e enum State); API LSP direta e popup de referências passaram. O resultado integral está em `.artifacts/native-packaged.json`. Isso não é aprovação da suíte geral nem comprovação de regressão causada pelos ícones; as falhas de navegação permanecem abertas. O recorte de SVGs é verificado separadamente pelo preview e pelo roteiro de inicialização nativo, que carrega PHP, JSON e pasta no workbench real.

Verificação final do pacote: os seis cenários de `check-startup.mjs` passaram, incluindo carregamento e decodificação dos ícones PHP, JSON e pasta (variantes clara/escura) no WebView Tauri real. `codesign --verify --deep --strict` aprovado. Resultado em `.artifacts/startup-native.json`.
