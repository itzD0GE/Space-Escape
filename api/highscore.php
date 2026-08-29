<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dataFile = __DIR__ . '/leaderboard.json';

function readLeaderboard(string $dataFile): array
{
    if (!is_file($dataFile)) {
        return [];
    }

    $contents = file_get_contents($dataFile);
    $entries = json_decode($contents === false ? '' : $contents, true);
    return is_array($entries) ? $entries : [];
}

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function leaderboardPayload(array $entries): array
{
    usort($entries, static fn(array $left, array $right): int => $right['score'] <=> $left['score']);
    $leaderboard = array_slice($entries, 0, 3);
    return [
        'highScore' => $leaderboard[0]['score'] ?? 0,
        'leaderboard' => $leaderboard,
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    respond(200, leaderboardPayload(readLeaderboard($dataFile)));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    respond(405, ['error' => 'Method not allowed']);
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload)) {
    respond(400, ['error' => 'Expected a JSON object']);
}

$initials = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string) ($payload['initials'] ?? '')));
$score = filter_var($payload['score'] ?? null, FILTER_VALIDATE_INT);
$wave = filter_var($payload['wave'] ?? null, FILTER_VALIDATE_INT);

if ($initials === '' || strlen($initials) > 3 || $score === false || $score < 0 || $score > 1000000 || $wave === false || $wave < 1 || $wave > 99) {
    respond(422, ['error' => 'Invalid leaderboard entry']);
}

$file = fopen($dataFile, 'c+');
if ($file === false || !flock($file, LOCK_EX)) {
    respond(500, ['error' => 'Unable to store leaderboard']);
}

$contents = stream_get_contents($file);
$entries = json_decode($contents === false ? '' : $contents, true);
$entries = is_array($entries) ? $entries : [];
$entries[] = [
    'id' => bin2hex(random_bytes(8)),
    'initials' => $initials,
    'score' => $score,
    'wave' => $wave,
];

$response = leaderboardPayload($entries);
rewind($file);
ftruncate($file, 0);
fwrite($file, json_encode($response['leaderboard'], JSON_UNESCAPED_SLASHES));
fflush($file);
flock($file, LOCK_UN);
fclose($file);

respond(200, $response);
