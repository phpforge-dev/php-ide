<?php

namespace Sem\Probe;

use Acme\Collections\Collection;
use Sem\Model\User;
use Sem\Model\Admin;
use Sem\Repository;
use Sem\UserCollection;

/**
 * @template T
 * @param T $value
 * @return T
 */
function identity($value)
{
    return $value;
}

$same = identity(new User());
$same->email(); // GEN-IDENTITY
/** @var Collection<int, User> $users */
$users = new Collection([]);
$users->first()->email(); // GEN-COLLECTION-FIRST
foreach ($users as $item) {
    $item->email(); // GEN-FOREACH
}
$typed = new UserCollection([]);
$typed->first()->email(); // GEN-EXTENDS
$admin = Repository::of(Admin::class);
$admin->promote(); // GEN-CLASS-STRING
