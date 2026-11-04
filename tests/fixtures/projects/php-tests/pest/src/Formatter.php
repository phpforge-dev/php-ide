<?php

namespace App;

/** Cobertura parcial proposital: `money` é exercitado, `percent` não. */
final class Formatter
{
    public function money(float $value): string
    {
        return 'R$ ' . number_format($value, 2, ',', '.');
    }

    public function percent(float $value): string
    {
        $rounded = round($value * 100, 1);
        return $rounded . '%';
    }
}
