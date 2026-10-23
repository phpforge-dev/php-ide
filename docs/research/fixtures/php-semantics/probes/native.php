<?php

namespace Sem\Probe;

$length = strlen('abc'); // NATIVE-FUNCTION
$date = new \DateTimeImmutable();
$date->format('Y'); // NATIVE-METHOD
$mapped = array_map(fn ($x) => $x, [1]); // NATIVE-ARRAY
$json = json_encode([]); // NATIVE-EXT-JSON
$found = array_find([1], fn ($x) => $x > 0); // NATIVE-LEVEL: PHP 8.4 function, project requires >=8.2
