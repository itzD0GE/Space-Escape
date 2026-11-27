<?php
declare(strict_types=1);
require __DIR__ . '/cors.php';

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

function publicView(?array $item): ?array
{
    if ($item !== null) {
        unset($item['key'], $item['keys']);
    }
    return $item;
}

function findMatch(array $matches, string $requestId): ?array
{
    foreach ($matches as $match) {
        if (is_array($match) && ($match['requestId'] ?? '') === $requestId) {
            return publicView($match);
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
    queueRespond(200, ['contract' => $contract, 'request' => publicView($data['request'] ?? null)]);
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
$initials = substr(preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($payload['initials'] ?? ''))), 0, 3);
$requestId = preg_replace('/[^a-f0-9]/', '', (string) ($payload['requestId'] ?? ''));
$role = (string) ($payload['role'] ?? '');
$key = preg_replace('/[^a-f0-9]/', '', (string) ($payload['key'] ?? '')); // per-player secret, only ever sent to that player
$score = filter_var($payload['score'] ?? null, FILTER_VALIDATE_INT);
$wave = filter_var($payload['wave'] ?? null, FILTER_VALIDATE_INT);
$sent = filter_var($payload['sent'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 9999]]);
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
        'key' => bin2hex(random_bytes(16)),
        'initials' => $initials,
        'createdAt' => time(),
    ];
    $response = ['contract' => $contract, 'request' => publicView($data['request']), 'key' => $data['request']['key']];
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
        'keys' => ['playerOne' => (string) ($pending['key'] ?? ''), 'playerTwo' => bin2hex(random_bytes(16))],
    ];
    $data['matches'][] = $match;
    $data['request'] = null;
    $response = ['contract' => $contract, 'match' => publicView($match), 'key' => $match['keys']['playerTwo']];
} elseif ($action === 'progress') {
    if ($requestId === '' || !in_array($role, ['playerOne', 'playerTwo'], true) || $score === false || $score < 0 || $score > 50000000 || $wave === false || $wave < 1 || $wave > 4) {
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
    $owner = $matchIndex === null ? '' : (string) ($data['matches'][$matchIndex]['keys'][$role] ?? '');
    if ($matchIndex !== null && ($owner === '' || $key === '' || !hash_equals($owner, $key))) {
        flock($file, LOCK_UN);
        fclose($file);
        queueRespond(403, ['error' => 'Not your contract']);
    }
    if ($matchIndex === null) {
        flock($file, LOCK_UN);
        fclose($file);
        queueRespond(404, ['error' => 'Contract match not found']);
    }
    $data['matches'][$matchIndex][$role]['score'] = $score;
    $data['matches'][$matchIndex][$role]['wave'] = $wave;
    // attack squads this pilot has earned so far; the rival's client spawns the difference
    // only grows, and never more than one squad per 12 kills' worth of the 3-wave quota
    $data['matches'][$matchIndex][$role]['sent'] = min(60, max((int) ($data['matches'][$matchIndex][$role]['sent'] ?? 0), $sent === false ? 0 : $sent));
    $data['matches'][$matchIndex][$role]['updatedAt'] = time();
    $response = ['contract' => $contract, 'match' => publicView($data['matches'][$matchIndex])];
} else {
    if (is_array($pending) && $requestId !== '' && hash_equals($pending['id'], $requestId) && $key !== '' && hash_equals((string) ($pending['key'] ?? ''), $key)) {
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
