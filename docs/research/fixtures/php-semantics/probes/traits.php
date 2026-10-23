<?php

namespace Sem\Probe;

use Sem\Model\User;

$user = new User();
$user->id(); // TRAIT-INSTEADOF: HasId::id wins
$user->legacyId(); // TRAIT-ALIAS: LegacyId::id as legacyId
$user->describeId(); // TRAIT-METHOD
$user->legacyOnly(); // TRAIT-SECOND
