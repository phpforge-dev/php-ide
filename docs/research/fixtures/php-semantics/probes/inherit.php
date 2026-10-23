<?php

namespace Sem\Probe;

use Sem\Model\Admin;
use Sem\Contracts\Named;

$admin = new Admin();
$admin->label(); // INHERIT-OVERRIDE: Admin::label
$admin->save()->promote(); // INHERIT-STATIC: save(): static keeps Admin
$admin->table(); // INHERIT-PARENT: User::table
$admin->id(); // INHERIT-TRAIT

function name(Named $named): string
{
    return $named->label(); // INHERIT-INTERFACE
}
