<?php
// Leaderboards, run tokens and score submission for Space Escape v2.
declare(strict_types=1);
require __DIR__ . '/cors.php';
require __DIR__ . '/lib.php';
require __DIR__ . '/lore.php';

const BOARD_SIZE = 100;
const REPLAY_TOP = 10;          // replays are kept for the top entries of each board
const REPLAY_MAX_BYTES = 420000;
const TOKEN_MAX_AGE = 6 * 3600;

function today(): string { return gmdate('Y-m-d'); }
function week(): string { return gmdate('o-\WW'); }
function daily_seed(string $day): int { return (int) hexdec(substr(hash('sha256', 'space-escape-daily-' . $day), 0, 8)); }
function board_file(string $board, ?string $day = null): string
{
    return match ($board) {
        'weekly' => 'board-week-' . week() . '.json',
        'daily' => 'board-daily-' . ($day ?? today()) . '.json',
        default => 'board-all.json',
    };
}
function public_entry(array $e): array
{
    return ['id' => $e['id'], 'initials' => $e['initials'], 'score' => $e['score'], 'wave' => $e['wave'], 'ship' => $e['ship'] ?? ''];
}
function top(string $board, int $n): array
{
    return array_map('public_entry', array_slice(read_json(board_file($board), []), 0, $n));
}
function legacy_champion(): ?array
{
    // Season 1 (v1.x) scores used different rules, so they are shown, not ranked.
    $path = __DIR__ . '/leaderboard.json';
    $old = is_file($path) ? json_decode(file_get_contents($path) ?: '', true) : null;
    return is_array($old) && isset($old[0]['initials'], $old[0]['score']) ? ['initials' => clean_initials($old[0]['initials']), 'score' => (int) $old[0]['score']] : null;
}
function home(): array
{
    return [
        'all' => top('all', 10), 'weekly' => top('weekly', 10), 'daily' => top('daily', 10),
        'legacy' => legacy_champion(), 'dailyInfo' => ['id' => today(), 'seed' => daily_seed(today())], 'lore' => daily_lore(),
    ];
}

/** Insert into one board, keep it sorted and trimmed. Returns [rank or null, kept in replay range]. */
function insert_entry(string $file, array $entry): array
{
    return with_json($file, [], static function (array &$list) use ($entry): array {
        $list[] = $entry;
        usort($list, static fn(array $a, array $b): int => [$b['score'], $a['ts']] <=> [$a['score'], $b['ts']]);
        $dropped = array_slice($list, BOARD_SIZE);
        $list = array_slice($list, 0, BOARD_SIZE);
        foreach ($dropped as $d) {
            @unlink(data_path('replay-' . preg_replace('/[^a-f0-9]/', '', $d['id']) . '.json'));
        }
        $rank = null;
        foreach ($list as $i => $e) {
            if ($e['id'] === $entry['id']) {
                $rank = $i + 1;
            }
        }
        return [$rank, $rank !== null && $rank <= REPLAY_TOP];
    });
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $a = (string) ($_GET['a'] ?? 'home');
    $b = (string) ($_GET['b'] ?? 'all');
    if (!in_array($b, ['all', 'weekly', 'daily'], true)) {
        respond(422, ['error' => 'Unknown board']);
    }
    if ($a === 'home') {
        respond(200, home());
    }
    if ($a === 'board') {
        respond(200, ['board' => $b, 'entries' => top($b, BOARD_SIZE)]);
    }
    if ($a === 'ghost') {
        foreach (read_json(board_file($b), []) as $e) {
            $path = data_path('replay-' . $e['id'] . '.json');
            if (!empty($e['replay']) && is_file($path)) {
                respond(200, ['initials' => $e['initials'], 'score' => $e['score'], 'run' => json_decode(file_get_contents($path) ?: 'null', true)]);
            }
        }
        respond(200, ['run' => null]);
    }
    respond(404, ['error' => 'Unknown action']);
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, ['error' => 'Method not allowed']);
}

$in = body();
$a = (string) ($in['a'] ?? '');

if ($a === 'start') {
    if (!rate_ok('start', 240, 3600)) {
        respond(429, ['error' => 'Too many runs started. Try again later.']);
    }
    $mode = ($in['mode'] ?? '') === 'daily' ? 'daily' : 'solo';
    $day = today();
    $seed = $mode === 'daily' ? daily_seed($day) : random_int(0, 4294967295);
    respond(200, ['seed' => $seed, 'dailyId' => $day, 'token' => sign(['id' => bin2hex(random_bytes(8)), 'seed' => $seed, 'mode' => $mode, 'day' => $day, 'iat' => time()])]);
}

if ($a !== 'submit') {
    respond(422, ['error' => 'Unknown action']);
}

$claim = verify((string) ($in['token'] ?? ''));
$initials = clean_initials($in['initials'] ?? '');
$score = int_in($in['score'] ?? null, 0, MAX_SCORE);
$wave = int_in($in['wave'] ?? null, 1, 99);
$ticks = int_in($in['ticks'] ?? null, 0, 60 * TOKEN_MAX_AGE); // 60 ticks per second, up to the token lifetime
if ($claim === null || $initials === '' || $score === null || $wave === null || $ticks === null) {
    respond(422, ['error' => 'Invalid score entry']);
}
$elapsed = time() - (int) $claim['iat'];
$seconds = $ticks / 60;
// Plausibility bounds. They stop casual tampering (instant or impossible scores); the stored
// replay is the real proof and can be re-simulated with tools/verify-replay.mjs.
$tooFast = $seconds > $elapsed + 5 || $seconds < ($wave - 1) * 8;
$tooMuch = $score > 300 + $seconds * 1200 * (1 + $wave);
if ($elapsed < 0 || $elapsed > TOKEN_MAX_AGE || $tooFast || $tooMuch) {
    respond(422, ['error' => 'Run rejected by the anti-cheat check']);
}
if (!rate_ok('submit', 40, 3600)) {
    respond(429, ['error' => 'Too many scores submitted. Try again later.']);
}
$fresh = with_json('used.json', [], static function (array &$used) use ($claim): bool {
    $cutoff = time() - TOKEN_MAX_AGE;
    $used = array_filter($used, static fn(int $t): bool => $t > $cutoff);
    if (isset($used[$claim['id']])) {
        return false;
    }
    $used[$claim['id']] = time();
    return true;
});
if (!$fresh) {
    respond(409, ['error' => 'This run was already submitted']);
}

$ship = preg_replace('/[^a-z]/', '', (string) ($in['ship'] ?? ''));
$entry = ['id' => $claim['id'], 'initials' => $initials, 'score' => $score, 'wave' => $wave, 'ship' => substr($ship, 0, 12), 'mode' => $claim['mode'], 'ts' => time(), 'replay' => false];

$replay = $in['replay'] ?? null;
$replayOk = is_array($replay) && is_string($replay['log'] ?? null) && strlen($replay['log']) <= REPLAY_MAX_BYTES
    && preg_match('/^[A-Za-z0-9+\/=]*$/', $replay['log']) === 1
    && (int) ($replay['seed'] ?? -1) === (int) $claim['seed'] && (int) ($replay['score'] ?? -1) === $score;
$entry['replay'] = $replayOk;

$ranks = [];
$keep = false;
$boards = $claim['mode'] === 'daily' ? ['daily' => board_file('daily', (string) $claim['day'])] : ['all' => board_file('all'), 'weekly' => board_file('weekly')];
foreach ($boards as $name => $file) {
    [$rank, $inReplayRange] = insert_entry($file, $entry);
    $ranks[$name] = $rank ?? '100+';
    $keep = $keep || $inReplayRange;
}
if ($replayOk && $keep) {
    $clean = [];
    foreach (['v', 'seed', 'W', 'H', 'targetWave', 'score', 'wave', 'ticks'] as $k) {
        $clean[$k] = (int) ($replay[$k] ?? 0);
    }
    $clean['mode'] = $claim['mode'];
    $clean['ship'] = $entry['ship'];
    $clean['log'] = $replay['log'];
    file_put_contents(data_path('replay-' . $entry['id'] . '.json'), json_encode($clean), LOCK_EX);
}

respond(200, ['id' => $entry['id'], 'ranks' => $ranks, 'home' => home()]);
