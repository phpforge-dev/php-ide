<?php

namespace Tests;

use App\Money\Currency;
use PHPUnit\Framework\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public function currency(string $code = 'BRL'): Currency
    {
        return new Currency($code);
    }
}
