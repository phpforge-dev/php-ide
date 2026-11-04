<?php

namespace App\Money;

/** Usada pelos testes de Feature: `code` é executado várias vezes, `symbol` nunca. */
final class Currency
{
    public function __construct(public readonly string $code = 'BRL')
    {
    }

    public function code(): string
    {
        return strtoupper($this->code);
    }

    public function symbol(): string
    {
        return match ($this->code) {
            'BRL' => 'R$',
            default => $this->code,
        };
    }
}
