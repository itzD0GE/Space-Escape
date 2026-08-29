<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dataFile = __DIR__ . '/duels.json';
$contractId = gmdate('Y-m-d');
$contract = [
    'id' => $contractId,
    'seed' => substr(hash('sha256', 'space-escape-rival-' . $contractId), 0, 16),
    'targetWave' => 3,
];

function duelRespond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function normalizeDuelEntries(mixed $entries): array
{
    if (!is_array($entries)) {
        return [];
    }

    return array_values(array_filter($entries, static fn(mixed $entry): bool => is_array($entry)));
}

function latestRival(array $entries, string $contractId): ?array
{
    $matches = array_values(array_filter($entries, static fn(array $entry): bool => ($entry['contractId'] ?? '') === $contractId));
    usort($matches, static fn(array $left, array $right): int => ($right['submittedAt'] ?? 0) <=> ($left['submittedAt'] ?? 0));

    if ($matches === []) {
        return null;
    }

    $rival = $matches[0];
    return [
        'initials' => $rival['initials'],
        'score' => $rival['score'],
        'wave' => $rival['wave'],
        'timeline' => $rival['timeline'],
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $contents = is_file($dataFile) ? file_get_contents($dataFile) : false;
    $entries = normalizeDuelEntries(json_decode($contents === false ? '' : $contents, true));
    duelRespond(200, ['contract' => $contract, 'rival' => latestRival($entries, $contractId)]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    duelRespond(405, ['error' => 'Method not allowed']);
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload)) {
    duelRespond(400, ['error' => 'Expected a JSON object']);
}

$initials = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string) ($payload['initials'] ?? '')));
$score = filter_var($payload['score'] ?? null, FILTER_VALIDATE_INT);
$wave = filter_var($payload['wave'] ?? null, FILTER_VALIDATE_INT);
$timeline = $payload['timeline'] ?? null;

if (($payload['contractId'] ?? '') !== $contractId || $initials === '' || strlen($initials) > 3 || $score === false || $score < 0 || $score > 1000000 || $wave === false || $wave < 1 || $wave > 4 || !is_array($timeline) || count($timeline) > 600) {
    duelRespond(422, ['error' => 'Invalid contract result']);
}

$cleanTimeline = [];
$previousSecond = -1;
foreach ($timeline as $point) {
    if (!is_array($point) || !isset($point['t'], $point['score']) || !is_int($point['t']) || !is_int($point['score']) || $point['t'] < 0 || $point['t'] <= $previousSecond || $point['score'] < 0 || $point['score'] > $score) {
        duelRespond(422, ['error' => 'Invalid score timeline']);
    }
    $cleanTimeline[] = ['t' => $point['t'], 'score' => $point['score']];
    $previousSecond = $point['t'];
}

$file = fopen($dataFile, 'c+');
if ($file === false || !flock($file, LOCK_EX)) {
    duelRespond(500, ['error' => 'Unable to store contract result']);
}

$contents = stream_get_contents($file);
$entries = normalizeDuelEntries(json_decode($contents === false ? '' : $contents, true));
$entries[] = [
    'contractId' => $contractId,
    'initials' => $initials,
    'score' => $score,
    'wave' => $wave,
    'timeline' => $cleanTimeline,
    'submittedAt' => time(),
];
$entries = array_slice($entries, -50);

rewind($file);
ftruncate($file, 0);
fwrite($file, json_encode($entries, JSON_UNESCAPED_SLASHES));
fflush($file);
flock($file, LOCK_UN);
fclose($file);

duelRespond(200, ['contract' => $contract, 'rival' => latestRival($entries, $contractId)]);
