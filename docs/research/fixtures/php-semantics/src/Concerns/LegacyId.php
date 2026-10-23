<?php

namespace Sem\Concerns;

trait LegacyId
{
    public function id(): int
    {
        return 0;
    }

    public function legacyOnly(): bool
    {
        return true;
    }
}
