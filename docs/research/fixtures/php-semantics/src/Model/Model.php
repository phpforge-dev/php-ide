<?php

namespace Sem\Model;

abstract class Model
{
    /** @var array<string, mixed> */
    protected array $attributes = [];

    abstract public function table(): string;

    public function save(): static
    {
        return $this;
    }

    protected function touch(): void
    {
    }

    public function label(): string
    {
        return 'model';
    }
}
