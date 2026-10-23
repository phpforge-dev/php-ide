<?php
namespace OtherReferences;
function reference_target(): string { return 'different function'; }
\OtherReferences\reference_target(); // FUNCTION-REFERENCE-NEGATIVE
