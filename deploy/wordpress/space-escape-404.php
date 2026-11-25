<?php
/**
 * Plugin Name: Space Escape 404
 * Description: Shows the 404: Space Escape game on "page not found" instead of the theme's 404 page.
 * Author: Nicholas Tech LLC
 *
 * Install: upload to wp-content/mu-plugins/ (create the folder if needed). Delete the file to undo.
 * The response keeps its 404 status, so search engines still see a missing page.
 */

add_action('template_redirect', static function (): void {
    if (!is_404() || is_admin() || wp_doing_ajax() || is_feed() || (defined('REST_REQUEST') && REST_REQUEST)) {
        return;
    }
    // Only for people asking for a page. Missing images, scripts and bot probes get the normal 404.
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    $path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if (stripos($accept, 'text/html') === false || preg_match('/\.[a-z0-9]{2,5}$/i', $path)) {
        return;
    }
    $game = ABSPATH . 'bstudio/404.shtml';
    $html = is_readable($game) ? file_get_contents($game) : false;
    if ($html === false) {
        return; // game not installed: fall back to the theme's 404
    }
    status_header(404);
    nocache_headers();
    header('Content-Type: text/html; charset=utf-8');
    // The game uses relative paths (js/, assets/, api/), so point them at its real folder.
    echo preg_replace('/<head>/i', '<head><base href="/bstudio/">', $html, 1);
    exit;
}, 0);
