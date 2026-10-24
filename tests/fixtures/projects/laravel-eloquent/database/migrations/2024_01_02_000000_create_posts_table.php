<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $t) {
            $t->id();
            $t->foreignIdFor(User::class);
            $t->string('title');
            $t->text('body');
            $t->decimal('rating', 3, 1);
            $t->timestamp('published_at')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });
    }
};
