<?php

namespace Fixture;

final class Admin extends User
{
    public function label(): string
    {
        return 'Synthetic admin';
    }
}
