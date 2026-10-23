@include('users.profile', ['id' => 1])
<x-alert type="error" message="Falhou" />
<x-forms.input name="email" />
<x-
<x-alert  />
<p>{{ __('messages.welcome') }}</p>
<p>{{ __('Hello') }}</p>
<p>{{ __('') }}</p>
<p>@lang('messages.nested.title')</p>
{{-- 1 INCLUDE-NAV; 2 COMP-NAV-01 classe; 3 COMP-NAV-02 anônimo; 4 COMP-COMP-01 após <x-; 5 ATTR-COMP-01 entre os espaços; 6 TRANS-NAV-01; 7 TRANS-NAV-02 JSON; 8 TRANS-COMP-01; 9 TRANS-NAV-03 @lang --}}
