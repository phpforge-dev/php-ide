<?php

namespace Fixture;

use Fixture\User as Person;

$user = new Person();
$user->label(); // NAV-01: caret on label; COMPLETE-01: replace label() with caret after ->
$user->id(); // NAV-TRAIT: caret on id
$admin = new Admin();
$admin->label(); // INHERIT-01
$other = new Unrelated();
$other->label(); // NEGATIVE-01: unrelated symbol must stay unchanged
$text = 'label'; // NEGATIVE-02: string occurrence is a separate rename option

function describe(Named $value): string
{
    return $value->label(); // IMPLEMENT-01: caret on label
}

/**
 * @template T
 * @param T $value
 * @return T
 */
function identity($value)
{
    return $value;
}

$inferred = identity(new User());
$inferred->label(); // TYPE-01: infer through PHPDoc template
$nullable = rand(0, 1) ? new User() : null;
if ($nullable instanceof User) {
    $nullable->id(); // TYPE-02: narrowing
}

strlen($text); // BUILTIN-01: declaration and signature

$state = State::Ready; // NAV-ENUM: declaration and usages
