<?php

namespace Tests\Unit;

use App\Calculator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

final class CalculatorTest extends TestCase
{
    public function testAddsNumbers(): void
    {
        $this->assertSame(4, (new Calculator())->add(2, 2));
    }

    #[Test]
    public function divides_numbers(): void
    {
        $this->assertSame(2.0, (new Calculator())->divide(4, 2));
    }

    /** Falha proposital: o painel deve mostrar a mensagem e a linha. */
    public function testFailsOnPurpose(): void
    {
        $this->assertSame(5, (new Calculator())->add(2, 2));
    }

    #[DataProvider('sums')]
    public function testSums(int $a, int $b, int $expected): void
    {
        $this->assertSame($expected, (new Calculator())->add($a, $b));
    }

    public static function sums(): array
    {
        return ['zero' => [0, 0, 0], 'positivos' => [1, 2, 3]];
    }

    public function testSkipped(): void
    {
        $this->markTestSkipped('Ainda não suportado');
    }

    private function helper(): void
    {
    }
}
