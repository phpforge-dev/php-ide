<?php

namespace App\Http\Controllers;

class UserController
{
    public function show(int $id)
    {
        $user = (object) ['name' => 'Ana'];

        return view('users.profile', ['id' => $id, 'user' => $user])->with('section', 'perfil');
    }

    public function compact(int $id)
    {
        $tab = 'dados';

        return view('users.profile', compact('id', 'tab'));
    }
}
