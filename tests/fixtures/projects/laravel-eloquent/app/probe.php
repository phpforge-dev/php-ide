<?php

use App\Models\Post;
use App\Models\User;

// Pontos de ensaio do recorte 25; os testes posicionam o cursor por trechos únicos.
$user = User::find(1);
$user->email;
User::verified()->whereEmail('x')->first()->posts;
Post::query()->where('title', 'x')->orderBy('rating')->pluck('body');
User::with('posts')->get();
User::where('emial', 1);
Post::where('author.x', 1);
route('users.show');
route('users.missing');
view('users.show');
view('users.edit');
view('vendor::mail');
config('app.name');
config('app.missing');
config('cache.default');
__('messages.welcome');
__('messages.goodbye');
__('Plain text');
User::with('postz')->get();
