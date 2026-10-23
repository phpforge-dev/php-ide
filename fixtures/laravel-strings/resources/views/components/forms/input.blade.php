@props(['name', 'label' => null])
<label>{{ $label ?? $name }} <input name="{{ $name }}"></label>
