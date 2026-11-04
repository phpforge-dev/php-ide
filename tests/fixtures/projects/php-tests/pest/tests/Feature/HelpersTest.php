<?php

use App\Money\Rates\Table;

it('uses the base test case', function () {
    $brl = $this->currency();
    expect($brl)->toBeCurrency('BRL');
    expect($this->currency())->code->toBe('BRL');
});

it('infers returned types', function () {
    expect(formatter())->toBeInstanceOf(App\Formatter::class);
    expect((new Table())->rate($this->currency(), $this->currency()))->toBe(1.0);
});

it('has custom expectations', function () {
    expect(1)->toBeOne();
});

it('counts executions', function (string $code) {
    expect($this->currency($code)->code())->toBe(strtoupper($code));
})->with(['brl', 'usd', 'eur']);
