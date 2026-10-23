<?php

use App\Calculator;

test('adds numbers', function () {
    expect((new Calculator())->add(2, 2))->toBe(4);
});

it('divides numbers', function () {
    expect((new Calculator())->divide(4, 2))->toBe(2.0);
});

it('fails on purpose', function () {
    expect((new Calculator())->add(2, 2))->toBe(5);
});

describe('datasets', function () {
    it('sums', function (int $a, int $b, int $expected) {
        expect((new Calculator())->add($a, $b))->toBe($expected);
    })->with([[0, 0, 0], [1, 2, 3]]);

    test('accepts emails', function (string $email) {
        expect($email)->toContain('@');
    })->with('emails');
});

it('is skipped', function () {
    expect(true)->toBeTrue();
})->skip('Ainda não suportado');

test("name with 'quotes' and (parens)", function () {
    expect(1)->toBe(1);
});
