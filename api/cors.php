<?php
// The copy of the game on radio.nicholastrading.com (Cloudflare) uses this API, so it shares one leaderboard.
declare(strict_types=1);

if (($_SERVER['HTTP_ORIGIN'] ?? '') === 'https://radio.nicholastrading.com') {
    header('Access-Control-Allow-Origin: https://radio.nicholastrading.com');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
