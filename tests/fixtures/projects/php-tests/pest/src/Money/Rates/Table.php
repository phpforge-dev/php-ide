<?php

namespace App\Money\Rates;

use App\Money\Currency;

final class Table
{
    public function rate(Currency $from, Currency $to): float
    {
        if ($from->code() === $to->code()) {
            return 1.0;
        }
        return 0.0;
    }
}
