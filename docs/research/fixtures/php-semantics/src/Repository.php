<?php

namespace Sem;

use Sem\Model\Model;

/**
 * @template T of Model
 */
final class Repository
{
    /** @param class-string<T> $class */
    public function __construct(private string $class)
    {
    }

    /** @return T */
    public function make(): Model
    {
        return new ($this->class)();
    }

    /**
     * @template M of Model
     * @param class-string<M> $class
     * @return M
     */
    public static function of(string $class): Model
    {
        return new $class();
    }
}
