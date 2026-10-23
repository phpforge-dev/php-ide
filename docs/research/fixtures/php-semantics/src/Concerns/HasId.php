<?php

namespace Sem\Concerns;

trait HasId
{
    public function id(): int
    {
        return 7;
    }

    public function describeId(): string
    {
        return 'id';
    }
}
