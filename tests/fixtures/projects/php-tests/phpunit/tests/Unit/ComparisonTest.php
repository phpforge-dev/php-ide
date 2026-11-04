<?php

namespace Tests\Unit;

use App\Formatter;
use PHPUnit\Framework\TestCase;

/** Falhas com valor esperado/obtido: o painel Run oferece a comparação (diff). */
final class ComparisonTest extends TestCase
{
    public function testFormatsMoney(): void
    {
        $this->assertSame('R$ 1.234,50', (new Formatter())->money(1234.5));
    }

    public function testComparesLists(): void
    {
        $this->assertEquals(['ana', 'bruno', 'carla'], ['ana', 'bruna', 'carla']);
    }

    public function testComparesText(): void
    {
        echo "saída do teste\n";
        $this->assertSame("linha 1\nlinha 2", "linha 1\nlinha dois");
    }
}
