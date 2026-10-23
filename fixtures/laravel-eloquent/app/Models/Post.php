<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Post extends Model
{
    use SoftDeletes;

    protected $casts = ['published_at' => 'immutable_datetime', 'rating' => 'float'];

    public function author()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function scopePublished($query, string $since = null)
    {
        return $query->whereNotNull('published_at');
    }
}
