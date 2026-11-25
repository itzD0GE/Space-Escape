// Server calls. Every one fails soft: offline or file:// play still works, just without boards.
const API = 'api/';

async function call(path, body) {
  try {
    const r = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export const net = {
  home: () => call('game.php?a=home'),                       // boards, daily info, lore, legacy champion
  board: (b) => call(`game.php?a=board&b=${b}`),             // full top 100 of one board
  start: (mode) => call('game.php', { a: 'start', mode }),   // run token + seed
  // Unlike the other calls, a rejected submission returns the server's reason ({error, status})
  // so the player is told why. null still means the server could not be reached at all.
  submit: async (payload) => {
    try {
      const r = await fetch(API + 'game.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'submit', ...payload }) });
      const body = await r.json().catch(() => null);
      return r.ok ? body : { error: (body && body.error) || `Server error ${r.status}`, status: r.status };
    } catch (e) { return null; }
  },
  ghost: (b) => call(`game.php?a=ghost&b=${b}`),             // top replay of a board
  queue: (requestId = '') => call(`duel-queue.php${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ''}`),
  queuePost: (payload) => call('duel-queue.php', payload),
  duelResult: (payload) => call('duel.php', payload)
};
