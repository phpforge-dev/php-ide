<?php

dataset('emails', ['ana@example.test', 'bruno@example.test']);

use App\Formatter;

uses(Tests\TestCase::class)->in('Feature');

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

expect()->extend('toBeCurrency', function (string $code) {
    return $this->toBeInstanceOf(App\Money\Currency::class)->and($this->value->code())->toBe($code);
});

function formatter(): Formatter
{
    return new Formatter();
}
