<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$queueFile = __DIR__ . '/duel-queue.json';
$contract = [
    'id' => gmdate('Y-m-d'),
    'seed' => substr(hash('sha256', 'space-escape-rival-' . gmdate('Y-m-d')), 0, 16),
    'targetWave' => 3,
];

function queueRespond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function readQueueData($file): array
{
    $contents = stream_get_contents($file);
    $data = json_decode($contents === false ? '' : $contents, true);
    return is_array($data) ? $data : ['request' => null, 'matches' => []];
}

function findMatch(array $matches, string $requestId): ?array
{
    foreach ($matches as $match) {
        if (is_array($match) && ($match['requestId'] ?? '') === $requestId) {
            return $match;
        }
    }
    return null;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $file = fopen($queueFile, 'c+');
    if ($file === false || !flock($file, LOCK_SH)) {
        queueRespond(500, ['error' => 'Unable to read contract queue']);
    }
    $data = readQueueData($file);
    flock($file, LOCK_UN);
    fclose($file);

    $requestId = preg_replace('/[^a-f0-9]/', '', (string) ($_GET['requestId'] ?? ''));
    if ($requestId !== '') {
        queueRespond(200, ['contract' => $contract, 'match' => findMatch($data['matches'] ?? [], $requestId)]);
    }
    queueRespond(200, ['contract' => $contract, 'request' => $data['request'] ?? null]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    queueRespond(405, ['error' => 'Method not allowed']);
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload)) {
    queueRespond(400, ['error' => 'Expected a JSON object']);
}

$action = (string) ($payload['action'] ?? '');
$initials = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string) ($payload['initials'] ?? '')));
$requestId = preg_replace('/[^a-f0-9]/', '', (string) ($payload['requestId'] ?? ''));
$role = (string) ($payload['role'] ?? '');
$score = filter_var($payload['score'] ?? null, FILTER_VALIDATE_INT);
$wave = filter_var($payload['wave'] ?? null, FILTER_VALIDATE_INT);
if (!in_array($action, ['request', 'accept', 'cancel', 'progress'], true)) {
    queueRespond(422, ['error' => 'Invalid queue action']);
}
if (($action === 'request' || $action === 'accept') && ($initials === '' || strlen($initials) > 3)) {
    queueRespond(422, ['error' => 'Invalid initials']);
}

$file = fopen($queueFile, 'c+');
if ($file === false || !flock($file, LOCK_EX)) {
    queueRespond(500, ['error' => 'Unable to update contract queue']);
}

$data = readQueueData($file);
$data['matches'] = array_values(array_filter($data['matches'] ?? [], static fn($match): bool => is_array($match) && ($match['createdAt'] ?? 0) > time() - 900));
$pending = $data['request'] ?? null;
if (is_array($pending) && ($pending['createdAt'] ?? 0) < time() - 65) {
    $pending = null;
    $data['request'] = null;
}

if ($action === 'request') {
    if ($pending !== null) {
        flock($file, LOCK_UN);
        fclose($file);
        queueRespond(409, ['error' => 'A contract is already waiting']);
    }
    $data['request'] = [
        'id' => bin2hex(random_bytes(8)),
        'initials' => $initials,
        'createdAt' => time(),
    ];
    $response = ['contract' => $contract, 'request' => $data['request']];
} elseif ($action === 'accept') {
    if (!is_array($pending) || $requestId === '' || !hash_equals($pending['id'], $requestId)) {
        flock($file, LOCK_UN);
        fclose($file);
        queueRespond(409, ['error' => 'Contract is no longer available']);
    }
    $match = [
        'requestId' => $pending['id'],
        'contract' => $contract,
        'playerOne' => ['initials' => $pending['initials'], 'score' => 0, 'wave' => 1, 'timeline' => []],
        'playerTwo' => ['initials' => $initials, 'score' => 0, 'wave' => 1, 'timeline' => []],
        'createdAt' => time(),
    ];
    $data['matches'][] = $match;
    $data['request'] = null;
    $response = ['contract' => $contract, 'match' => $match];
} elseif ($action === 'progress') {
    if ($requestId === '' || !in_array($role, ['playerOne', 'playerTwo'], true) || $score === false || $score < 0 || $score > 1000000 || $wave === false || $wave < 1 || $wave > 4) {
        flock($file, LOCK_UN);
        fclose($file);
        queueRespond(422, ['error' => 'Invalid contract progress']);
    }
    $matchIndex = null;
    foreach ($data['matches'] as $index => $match) {
        if (is_array($match) && ($match['requestId'] ?? '') === $requestId) {
            $matchIndex = $index;
            break;
        }
    }
    if ($matchIndex === null) {
        flock($file, LOCK_UN);
        fclose($file);
        queueRespond(404, ['error' => 'Contract match not found']);
    }
    $data['matches'][$matchIndex][$role]['score'] = $score;
    $data['matches'][$matchIndex][$role]['wave'] = $wave;
    $data['matches'][$matchIndex][$role]['updatedAt'] = time();
    $response = ['contract' => $contract, 'match' => $data['matches'][$matchIndex]];
} else {
    if (is_array($pending) && $requestId !== '' && hash_equals($pending['id'], $requestId)) {
        $data['request'] = null;
    }
    $response = ['contract' => $contract, 'cancelled' => true];
}

rewind($file);
ftruncate($file, 0);
fwrite($file, json_encode($data, JSON_UNESCAPED_SLASHES));
fflush($file);
flock($file, LOCK_UN);
fclose($file);

queueRespond(200, $response);
