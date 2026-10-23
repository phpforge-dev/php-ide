<?php

namespace Acme\Collections;

/**
 * Synthetic generic collection.
 *
 * @template TKey of array-key
 * @template TValue
 * @implements \IteratorAggregate<TKey, TValue>
 */
class Collection implements \IteratorAggregate
{
    /** @param array<TKey, TValue> $items */
    public function __construct(protected array $items = [])
    {
    }

    /** @return TValue|null */
    public function first(): mixed
    {
        foreach ($this->items as $item) {
            return $item;
        }
        return null;
    }

    /** @return array<TKey, TValue> */
    public function all(): array
    {
        return $this->items;
    }

    /** @return \ArrayIterator<TKey, TValue> */
    public function getIterator(): \ArrayIterator
    {
        return new \ArrayIterator($this->items);
    }

    /**
     * @template TOut
     * @param callable(TValue): TOut $callback
     * @return static<TKey, TOut>
     */
    public function map(callable $callback): static
    {
        return new static(array_map($callback, $this->items));
    }
}
