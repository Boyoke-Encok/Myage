// Klien API MyAgeApp (https://myageapp.xyz/api).
// Auth: header Authorization: tma <initData> (initData mentah Telegram).
// Tidak ada pertukaran login/token terpisah; endpoint session adalah pemeriksaan auth.
// Hanya klaim GRATIS: session, spin, daily, vault, mystery, tag, bio, welcome.
// TIDAK PERNAH: withdraw, pass/mint, spin berbayar, connect wallet, tasks.

const DEFAULT_TIMEOUT = 15000;

export class AuthError extends Error {
  constructor(msg) { super(msg); this.code = 'AUTH'; }
}
export class BlockedError extends Error {
  constructor(msg) { super(msg); this.code = 'BLOCKED'; }
}
export class ClosedError extends Error {
  constructor(msg, opensInMs) { super(msg); this.code = 'CLOSED'; this.opensInMs = opensInMs; }
}
export class ReopenError extends Error {
  constructor(msg) { super(msg); this.code = 'REOPEN'; }
}
export class RetryableError extends Error {
  constructor(msg) { super(msg); this.code = 'RETRYABLE'; }
}

export function newIdemKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export class MyAgeApi {
  constructor(initData, apiBase, timeoutMs = DEFAULT_TIMEOUT) {
    this.initData = initData;
    this.apiBase = String(apiBase || '').replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = 'POST', body = {}, idemKey = null } = {}) {
    const headers = {
      'Authorization': `tma ${this.initData}`,
      'Content-Type': 'application/json',
      'Origin': 'https://myageapp.xyz',
      'Referer': 'https://myageapp.xyz/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    };
    let key = idemKey;
    if (method === 'POST') {
      if (!key) key = newIdemKey();
      headers['Idempotency-Key'] = key;
    }
    let res;
    try {
      res = await fetch(`${this.apiBase}/${path}`, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new RetryableError(`jaringan: ${e.message || e}`);
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401) throw new AuthError('initData tidak valid/kedaluwarsa (401).');
    if (res.status === 403) throw new BlockedError('akun diblokir (403).');
    if (res.status === 409 && data && data.reopen) throw new ReopenError('sesi perlu dibuka ulang (409).');
    if (res.status === 503) throw new ClosedError('aplikasi tutup sementara (503).', data ? data.opensInMs : undefined);
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
    return { data: data && data.data !== undefined ? data.data : data, raw: data, idemKey: key };
  }

  async post(path, body = {}, idemKey = null) {
    return this.request(path, { method: 'POST', body, idemKey });
  }

  async session() { return this.post('session', {}); }
  async spin(idemKey = null) { return this.post('spin', {}, idemKey); }
  async daily(idemKey = null) { return this.post('daily', {}, idemKey); }
  async vault(idemKey = null) { return this.post('vault', {}, idemKey); }
  async mystery(idemKey = null) { return this.post('mystery', {}, idemKey); }
  async tag(idemKey = null) { return this.post('tag', {}, idemKey); }
  async bio(idemKey = null) { return this.post('bio', {}, idemKey); }
  async welcome(idemKey = null) { return this.post('welcome', {}, idemKey); }
  // Tugas: GET daftar, POST {taskId} untuk cek/klaim, POST {taskId, action:'watch'}
  // untuk mendaftarkan ronde tonton drama. Server yang memverifikasi tugas selesai.
  async tasksGet() { return this.request('tasks', { method: 'GET' }); }
  async tasksClaim(taskId, idemKey = null) { return this.post('tasks', { taskId }, idemKey); }
  async tasksWatch(taskId, idemKey = null) { return this.post('tasks', { taskId, action: 'watch' }, idemKey); }
}
