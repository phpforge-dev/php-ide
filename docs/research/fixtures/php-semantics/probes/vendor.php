<?php

namespace Sem\Probe;

use Acme\Collections\Collection;
use Acme\Missing\Thing;

$collection = new Collection([1, 2]); // VENDOR-CLASS
$collection->all(); // VENDOR-METHOD
$missing = new Thing(); // VENDOR-MISSING: no target, no crash
