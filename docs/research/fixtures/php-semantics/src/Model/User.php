<?php

namespace Sem\Model;

use Sem\Concerns\HasId;
use Sem\Concerns\LegacyId;
use Sem\Contracts\Named;

/**
 * @property string $email
 * @property-read int $age
 * @method static User findByEmail(string $email)
 * @method Address address()
 */
class User extends Model implements Named
{
    use HasId, LegacyId {
        HasId::id insteadof LegacyId;
        LegacyId::id as legacyId;
    }

    public function table(): string
    {
        return 'users';
    }

    public function label(): string
    {
        return 'user';
    }

    public function email(): string
    {
        return 'user@example.invalid';
    }
}
