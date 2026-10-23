<?php
// Local MIT dependency fix. Keep the upstream download checksum separate from the patched artifact.
declare(strict_types=1);
$path = $argv[1] ?? dirname(__DIR__).'/.tools/phpactor.phar';
$upstream = 'b28bf6166e016d539fc2f2aec18ef918b12590e436a6f1ccbdf30b5bbdbdb16b';
$entry = 'lib/Indexer/Model/Query/FunctionQuery.php';
$manifest = $path.'.patch.json';
$hash = hash_file('sha256', $path);
$needle = '        $record = $this->get($identifier);'."\n";
$replacement = $needle."        // PHP IDE: an absent function record has no indexed references.\n        if (null === \$record) {\n            return;\n        }\n";
$source = (new Phar($path))[$entry]->getContent();
if (str_contains($source, $replacement)) {
    $saved = is_file($manifest) ? json_decode(file_get_contents($manifest), true) : null;
    if (($saved['patchedSha256'] ?? null) !== $hash || ($saved['upstreamSha256'] ?? null) !== $upstream) {
        throw new RuntimeException('Patched PHAR does not match its provenance manifest');
    }
    echo "Phpactor missing-function-record patch already verified.\n";
    exit(0);
}
if ($hash !== $upstream || substr_count($source, $needle) !== 1) {
    throw new RuntimeException('Unexpected Phpactor artifact or patch target; refusing to modify it');
}
$temporary = $path.'.patching.phar';
try {
    if (!copy($path, $temporary)) throw new RuntimeException('Cannot create temporary PHAR');
    $phar = new Phar($temporary);
    $phar[$entry] = str_replace($needle, $replacement, $source);
    $phar->setSignatureAlgorithm(Phar::SHA256);
    unset($phar);
    $patchedHash = hash_file('sha256', $temporary);
    if (!rename($temporary, $path)) throw new RuntimeException('Cannot install patched PHAR');
    file_put_contents($manifest, json_encode(['version'=>'2026.10.07.0','patch'=>'function-query-missing-record-v1','upstreamSha256'=>$upstream,'patchedSha256'=>$patchedHash], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\n");
    echo "Phpactor missing-function-record patch applied; provenance recorded.\n";
} finally {
    if (is_file($temporary)) unlink($temporary);
}
