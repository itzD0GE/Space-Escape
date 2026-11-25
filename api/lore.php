<?php
// Daily flavour text: a mission briefing and boss taunts, generated once a day by Claude
// and cached. With no API key configured the game uses the built-in lines below, so
// this is optional. It is cosmetic only and never touches the simulation.
//
// Raw HTTP is used on purpose: the game deploys by plain file upload with no Composer,
// so the official PHP SDK is not available on the host.
//
// To switch it on, copy config.example.php to data/config.php and add a key.
// To pre-generate (recommended), add a daily cron job:  php /path/to/api/lore.php
declare(strict_types=1);
require_once __DIR__ . '/lib.php';

const LORE_POOL = [
    ['briefing' => 'Signal lost. The page you wanted drifted past the last beacon. Bring it home, pilot.', 'taunts' => ['You are 404 too.', 'Nothing here but me.', 'Turn back, little link.', 'This sector is not indexed.', 'I ate your page.']],
    ['briefing' => 'Deep-space relay reports a missing page and a lot of angry rocks. One of those is your problem.', 'taunts' => ['No results found. Only me.', 'Your request timed out.', 'Access denied, pilot.', 'I am the broken link.', 'Refresh all you like.']],
    ['briefing' => 'The void swallowed another URL. Command wants it back. The donuts are a bonus.', 'taunts' => ['Dead end.', 'This is where pages go to die.', 'You took a wrong turn.', 'Not found. Not ever.', 'Mind the gap.']],
];

function lore_fallback(): array
{
    return LORE_POOL[((int) gmdate('z')) % count(LORE_POOL)];
}

function lore_config(): array
{
    $path = DATA_DIR . '/config.php';
    $config = is_file($path) ? require $path : [];
    return is_array($config) ? $config : [];
}

function lore_clean(mixed $text, int $max): string
{
    $clean = trim(preg_replace('/\s+/', ' ', strip_tags((string) $text)));
    return function_exists('mb_substr') ? mb_substr($clean, 0, $max) : substr($clean, 0, $max);
}

/** Ask Claude for today's lines. Returns null on any failure; callers fall back. */
function lore_generate(string $key, string $model): ?array
{
    if (!function_exists('curl_init')) {
        return null;
    }
    $request = [
        'model' => $model,
        'max_tokens' => 2000,
        'fallbacks' => 'default',
        'output_config' => [
            'effort' => 'low',
            'format' => ['type' => 'json_schema', 'schema' => [
                'type' => 'object',
                'properties' => [
                    'briefing' => ['type' => 'string'],
                    'taunts' => ['type' => 'array', 'items' => ['type' => 'string']],
                ],
                'required' => ['briefing', 'taunts'],
                'additionalProperties' => false,
            ]],
        ],
        'system' => 'You write flavour text for "404: Space Escape", an arcade space shooter that is played on a website\'s 404 "page not found" screen. Tone: playful retro arcade, family friendly, no profanity, no real brands or people.',
        'messages' => [[
            'role' => 'user',
            'content' => 'Today is ' . gmdate('l, j F Y') . '. Write today\'s content: "briefing" is one mission briefing for the pilot, at most 150 characters. "taunts" is exactly 6 short boss taunts, each at most 40 characters, that pun on missing pages, broken links or deep space.',
        ]],
    ];
    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-api-key: ' . $key,
            'anthropic-version: 2026-10-21',
            'anthropic-beta: server-side-fallback-2026-07-01',
        ],
        CURLOPT_POSTFIELDS => json_encode($request),
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $response = is_string($raw) ? json_decode($raw, true) : null;
    if ($status !== 200 || !is_array($response) || ($response['stop_reason'] ?? '') === 'refusal') {
        error_log('space-escape lore: generation failed with HTTP ' . $status);
        return null;
    }
    foreach ($response['content'] ?? [] as $block) {
        if (($block['type'] ?? '') !== 'text') {
            continue;
        }
        $data = json_decode((string) $block['text'], true);
        if (!is_array($data) || !is_array($data['taunts'] ?? null)) {
            return null;
        }
        $taunts = array_values(array_filter(array_map(static fn($t): string => lore_clean($t, 48), array_slice($data['taunts'], 0, 8))));
        $briefing = lore_clean($data['briefing'] ?? '', 180);
        return $briefing !== '' && $taunts !== [] ? ['briefing' => $briefing, 'taunts' => $taunts, 'ai' => true] : null;
    }
    return null;
}

/** Generate and cache today's lore if a key is configured and nobody else is already doing it. */
function lore_refresh(): void
{
    $config = lore_config();
    $key = (string) ($config['anthropic_api_key'] ?? '');
    $file = 'lore-' . gmdate('Y-m-d') . '.json';
    if ($key === '' || is_file(data_path($file))) {
        return;
    }
    $lock = fopen(data_path('lore.lock'), 'c');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        return;
    }
    $lore = lore_generate($key, (string) ($config['model'] ?? 'claude-opus-5-5'));
    // Cache a failure too (as the fallback) so a broken key is retried once a day, not on every visit.
    file_put_contents(data_path($file), json_encode($lore ?? lore_fallback()), LOCK_EX);
    foreach (glob(DATA_DIR . '/lore-*.json') ?: [] as $old) {
        if (basename($old) !== $file) {
            @unlink($old);
        }
    }
    flock($lock, LOCK_UN);
    fclose($lock);
}

/** Today's lore for the client. Never blocks on the AI call: that runs after the response is sent. */
function daily_lore(): array
{
    $cached = read_json('lore-' . gmdate('Y-m-d') . '.json', null);
    if (is_array($cached) && isset($cached['briefing'])) {
        return $cached;
    }
    register_shutdown_function(static function (): void {
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } elseif (function_exists('litespeed_finish_request')) {
            litespeed_finish_request();
        } else {
            return; // cannot detach from the request here: leave it to the cron job
        }
        lore_refresh();
    });
    return lore_fallback();
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    lore_refresh();
    echo json_encode(read_json('lore-' . gmdate('Y-m-d') . '.json', lore_fallback()), JSON_PRETTY_PRINT) . "\n";
}
