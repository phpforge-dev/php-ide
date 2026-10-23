# Fixture Composer

`hash/` tem um `composer.json` e o `composer.lock` gerado pelo Composer 2.10.3 oficial (imagem Docker `composer:2`, container descartável) sem dependências externas. Serve de vetor de teste para o cálculo do `content-hash` (barras, não-ASCII, `{}` vazio, float e `config.platform`).
