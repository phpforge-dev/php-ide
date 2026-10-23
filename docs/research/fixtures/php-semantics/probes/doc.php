<?php

namespace Sem\Probe;

use Sem\Model\User;

/**
 * @param User[] $users
 * @return array<int, User>
 */
function sortUsers(array $users): array
{
    foreach ($users as $each) {
        $each->email(); // DOC-PARAM-ARRAY
    }
    return $users;
}

/** @var \Sem\Model\Admin $documented */
$documented = $GLOBALS['admin'];
$documented->promote(); // DOC-VAR-FQN
$sorted = sortUsers([]);
$sorted[0]->label(); // DOC-RETURN-ARRAY
$user = new User();
$user->email; // DOC-PROPERTY
$user->age; // DOC-PROPERTY-READ
$user->address()->city(); // DOC-METHOD
User::findByEmail('a')->label(); // DOC-STATIC-METHOD

/**
 * @param int<0, $broken
 * @return
 */
function invalidDoc($value)
{
    return $value;
}
invalidDoc(1); // DOC-INVALID: analysis keeps working
