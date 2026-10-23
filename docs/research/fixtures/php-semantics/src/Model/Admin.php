<?php

namespace Sem\Model;

final class Admin extends User
{
    public function label(): string
    {
        return 'admin:' . parent::label();
    }

    public function promote(): self
    {
        return $this;
    }
}
