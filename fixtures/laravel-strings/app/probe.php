<?php

// Pontos de ensaio: cursor dentro da string indicada.
route('users.show', ['id' => 1]); // ROUTE-NAV-01
route('admin.dashboard'); // ROUTE-NAV-02: prefixo de grupo
route('missing.route'); // ROUTE-NEG-01
view('users.profile'); // VIEW-NAV-01
view('welcome'); // VIEW-NAV-02
config('app.name'); // CONFIG-NAV-01
config('services.mail.host'); // CONFIG-NAV-02: chave aninhada
config('app'); // CONFIG-NAV-03: arquivo
env('APP_NAME'); // ENV-NAV-01
env('QUEUE_DRIVER'); // ENV-NAV-02: só em .env.example
route(''); // ROUTE-COMP-01
view(''); // VIEW-COMP-01
config(''); // CONFIG-COMP-01
env(''); // ENV-COMP-01
