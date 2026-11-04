<?php

use App\Formatter;

it('formats money', function (float $value) {
    expect((new Formatter())->money($value))->toStartWith('R$ ');
})->with('money');

it('compares lists', function () {
    expect(['ana', 'bruna', 'carla'])->toEqual(['ana', 'bruno', 'carla']);
});

test('pairs are equal', function (int $a, int $b) {
    expect($a)->toBe($b)->and($a + $b)->toBeInt();
})->with('pairs');
