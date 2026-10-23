<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;

class User extends Authenticatable
{
    protected $fillable = ['full_name', 'email', 'nickname'];

    protected $hidden = ['remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'active' => 'boolean',
        ];
    }

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }

    public function getDisplayNameAttribute(): string
    {
        return $this->nickname ?? $this->full_name;
    }

    protected function initials(): Attribute
    {
        return Attribute::make(get: fn (): string => strtoupper(substr($this->full_name, 0, 1)));
    }

    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }

    #[Scope]
    protected function verified(Builder $query): void
    {
        $query->whereNotNull('email_verified_at');
    }
}
