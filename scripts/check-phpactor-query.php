<?php
declare(strict_types=1);
$path = realpath($argv[1] ?? dirname(__DIR__).'/.tools/phpactor.phar');
if (!$path) throw new RuntimeException('Phpactor PHAR missing');
require 'phar://'.$path.'/vendor/autoload.php';
use Phpactor\Indexer\Adapter\Php\InMemory\InMemoryIndex;
use Phpactor\Indexer\Model\Query\FunctionQuery;
use Phpactor\Indexer\Model\Record\FunctionRecord;
use Phpactor\Indexer\Model\Record\FileRecord;
use Phpactor\Indexer\Model\RecordReference;
function expect(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$index = new InMemoryIndex();
$query = new FunctionQuery($index);
expect(iterator_to_array($query->referencesTo('missing_function')) === [], 'Absent record should yield no indexed references');
$record = FunctionRecord::fromName('known_function');
$index->write($record);
expect(iterator_to_array($query->referencesTo('known_function')) === [], 'Known function without usages should yield no references');
$file = FileRecord::fromPath('/fixture/call.php');
$file->addReference(new RecordReference('function', $record->identifier(), 6, null, 0, 20));
$record->addReference('/fixture/call.php');
$index->write($record); $index->write($file);
expect(count(iterator_to_array($query->referencesTo('known_function'))) === 1, 'Known usage must remain available');
$manifest = json_decode(file_get_contents($path.'.patch.json'), true, flags: JSON_THROW_ON_ERROR);
expect(hash_file('sha256', $path) === $manifest['patchedSha256'], 'Patched PHAR provenance mismatch');
echo "Phpactor query: absent record, empty record, known usage and artifact provenance passed.\n";
