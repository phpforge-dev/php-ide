<?php

namespace Sem\Probe;

use Sem\Model\User as Person;
use Sem\Model\Admin;
use Sem\Model\Address;

function maybeUser(): ?Person
{
    return rand(0, 1) ? new Person() : null;
}

function anything(): mixed
{
    return null;
}

$alias = new Person();
$alias->email(); // TYPE-ALIAS
$returned = maybeUser();
$returned?->label(); // TYPE-NULLSAFE
$union = rand(0, 1) ? new Admin() : new Address();
if ($union instanceof Admin) {
    $union->promote(); // TYPE-INSTANCEOF
}
$assigned = $alias->save();
$assigned->table(); // TYPE-STATIC-RETURN
$unknown = anything();
$unknown->whatever(); // TYPE-UNKNOWN: must not invent members
$matched = match (true) { default => new Address() };
$matched->city(); // TYPE-MATCH
