<?php
// Shared helpers for the Space Escape API. Flat JSON files with exclusive locks:
// ponytail: fine for a few writes per second on shared hosting; move to SQLite/MySQL
// if the leaderboard ever sees sustained concurrent traffic.
declare(strict_types=1);

const DATA_DIR = __DIR__ . '/data';
const MAX_SCORE = 50000000;

function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array
{
    $payload = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($payload)) {
        respond(400, ['error' => 'Expected a JSON object']);
    }
    return $payload;
}

function data_path(string $name): string
{
    if (!is_dir(DATA_DIR)) {
        mkdir(DATA_DIR, 0755, true);
    }
    if (!is_file(DATA_DIR . '/.htaccess')) {
        // keep runtime data out of reach of direct web requests
        file_put_contents(DATA_DIR . '/.htaccess', "Require all denied\n");
    }
    return DATA_DIR . '/' . $name;
}

function read_json(string $name, mixed $default = []): mixed
{
    $path = data_path($name);
    if (!is_file($path)) {
        return $default;
    }
    $data = json_decode(file_get_contents($path) ?: '', true);
    return $data === null ? $default : $data;
}

/** Read, change and write one JSON file under an exclusive lock. $fn gets the data by reference. */
function with_json(string $name, mixed $default, callable $fn): mixed
{
    $file = fopen(data_path($name), 'c+');
    if ($file === false || !flock($file, LOCK_EX)) {
        respond(500, ['error' => 'Storage unavailable']);
    }
    $data = json_decode(stream_get_contents($file) ?: '', true);
    if ($data === null) {
        $data = $default;
    }
    $result = $fn($data);
    rewind($file);
    ftruncate($file, 0);
    fwrite($file, json_encode($data, JSON_UNESCAPED_SLASHES));
    fflush($file);
    flock($file, LOCK_UN);
    fclose($file);
    return $result;
}

/** Server secret, generated on first use. Stored as PHP so it can never be served as text. */
function secret(): string
{
    $path = data_path('secret.php');
    if (!is_file($path)) {
        file_put_contents($path, "<?php return '" . bin2hex(random_bytes(32)) . "';\n", LOCK_EX);
    }
    return (string) require $path;
}

function sign(array $payload): string
{
    $data = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
    return $data . '.' . hash_hmac('sha256', $data, secret());
}

function verify(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 2 || !hash_equals(hash_hmac('sha256', $parts[0], secret()), $parts[1])) {
        return null;
    }
    $payload = json_decode(base64_decode(strtr($parts[0], '-_', '+/')) ?: '', true);
    return is_array($payload) ? $payload : null;
}

/** True while the caller is under $max hits per $window seconds. Addresses are stored hashed. */
function rate_ok(string $bucket, int $max, int $window): bool
{
    $key = $bucket . ':' . substr(hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'cli', secret()), 0, 16);
    return with_json('rate.json', [], static function (array &$all) use ($key, $max, $window): bool {
        $now = time();
        foreach ($all as $k => $hits) {
            $all[$k] = array_values(array_filter($hits, static fn(int $t): bool => $t > $now - 3600));
            if ($all[$k] === []) {
                unset($all[$k]);
            }
        }
        $recent = array_filter($all[$key] ?? [], static fn(int $t): bool => $t > $now - $window);
        if (count($recent) >= $max) {
            return false;
        }
        $all[$key][] = $now;
        return true;
    });
}

function clean_initials(mixed $value): string
{
    return substr(preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $value)), 0, 3);
}

function int_in(mixed $value, int $min, int $max): ?int
{
    $v = filter_var($value, FILTER_VALIDATE_INT);
    return $v === false || $v < $min || $v > $max ? null : $v;
}
