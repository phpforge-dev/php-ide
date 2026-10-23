<?php

use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => view('welcome'))->name('home');
Route::get('/users/{id}', [UserController::class, 'show'])->name('users.show');
Route::name('admin.')->group(function () {
    Route::get('/admin', fn () => 'admin')->name('dashboard');
});
