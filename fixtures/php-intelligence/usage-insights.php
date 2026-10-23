<?php
namespace UsageInsights;

function insight_used(): void {}
function insight_unused(): void {}

class InsightTarget
{
    private function hidden(): void {}
    public function used(): void {}
    public function unused(): void {}
}

// insight_unused(); hidden(); unused(); comments are not references.
$text = 'insight_unused hidden unused';
insight_used();
$target = new InsightTarget();
$target->used();
