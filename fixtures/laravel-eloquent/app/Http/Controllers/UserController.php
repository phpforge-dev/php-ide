<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Models\User;

class UserController
{
    public function show(User $user)
    {
        $posts = $user->posts()->published()->orderBy('published_at')->get();
        foreach ($posts as $post) {
            $post->author->email;
        }
        $first = User::active()->where('email', 'a@example.com')->first();
        $first->posts;
        return view('users.show', ['user' => $user]);
    }
}
