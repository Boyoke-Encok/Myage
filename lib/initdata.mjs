// Parse + validasi initData Telegram (query_id) untuk MyAgeApp.
// Menerima: query_id mentah, atau URL lengkap mini app (tgWebAppData=...).
// TIDAK PERNAH menulis initData ke log/chat.

// Ambil initData dari tempelan (mentah atau URL lengkap).
export function extractInitData(input) {
  if (!input || typeof input !== 'string') {
    return { ok: false, error: 'Tempelan kosong.' };
  }
  let s = input.trim();
  // URL lengkap mini app: ...?tgWebAppData=<initData-urlencoded>&tgWebAppVersion=...
  const m = s.match(/tgWebAppData=([^&]+)/);
  if (m) {
    try { s = decodeURIComponent(m[1]); } catch { s = m[1]; }
  }
  const qi = s.indexOf('query_id=');
  if (qi === -1) {
    return { ok: false, error: 'TIDAK VALID: bagian "query_id=..." tidak ditemukan. Salin dari awal (di Chrome ketuk address bar lalu ikon salin, jangan seleksi manual).' };
  }
  s = s.slice(qi).trim();
  return { ok: true, initData: s };
}

// Validasi struktur + umur initData. TIDAK memeriksa HMAC (itu tugas server).
export function parseInitData(input) {
  const ex = extractInitData(input);
  if (!ex.ok) return ex;
  const params = new URLSearchParams(ex.initData);
  const missing = [];
  for (const f of ['query_id', 'user', 'auth_date', 'hash']) {
    if (!params.get(f)) missing.push(f);
  }
  if (missing.length) {
    return { ok: false, error: `TIDAK VALID: field hilang: ${missing.join(', ')}. Tempel ulang query_id lengkap.` };
  }
  let user;
  try {
    user = JSON.parse(params.get('user'));
  } catch {
    return { ok: false, error: 'TIDAK VALID: bagian user bukan JSON.' };
  }
  if (!user || typeof user.id !== 'number') {
    return { ok: false, error: 'TIDAK VALID: user.id tidak ditemukan.' };
  }
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) {
    return { ok: false, error: 'TIDAK VALID: auth_date bukan angka.' };
  }
  const ageMs = Date.now() - authDate * 1000;
  if (ageMs > 24 * 3600 * 1000) {
    return { ok: false, error: 'TIDAK BERLAKU: query_id sudah lebih dari 24 jam. Buka lagi mini app @MyAgeApp lalu salin query_id yang baru.' };
  }
  return {
    ok: true,
    initData: ex.initData,
    userId: user.id,
    firstName: user.first_name || '',
    username: user.username || '',
    ageMs,
    warnOld: ageMs > 20 * 3600 * 1000,
  };
}
