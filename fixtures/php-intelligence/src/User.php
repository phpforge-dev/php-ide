<?php

namespace Fixture;

class User implements Named
{
    use HasId;

    public function label(): string
    {
        return 'Synthetic user';
    }

    private function secret(): string
    {
        return 'fixture-only';
    }
}
