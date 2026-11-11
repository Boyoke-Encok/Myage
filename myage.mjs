// MyAgeApp — bot Termux: spin gratis + daily otomatis, loop sesuai durasi.
// Login pakai query_id (initData) Telegram — user ID saja TIDAK BISA (server cek HMAC).
// Akun disimpan di ~/.myage/akun.txt (mode 600), satu query_id per baris.
// HANYA klaim gratis: spin, daily, vault, mystery, tag, bio, welcome + tugas yang
// bisa diklaim (server yang memverifikasi; screenshot/link X/nonton drama dilewati).
// TIDAK PERNAH: withdraw, pass/mint, spin berbayar, connect wallet, tasks berbayar, posting.
// Jalankan: node myage.mjs login | node myage.mjs check | node myage.mjs farm [--once]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { parseInitData } from './lib/initdata.mjs';
import { MyAgeApi, newIdemKey, AuthError, BlockedError, ClosedError } from './lib/api.mjs';
import { decideTask, taskTitle, taskRewardText, claimRewardText } from './lib/tasks.mjs';
import { sleepCountdown } from './lib/countdown.mjs';

const CONFIG = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const STORE_DIR = path.join(os.homedir(), '.myage');
const AKUN_FILE = path.join(STORE_DIR, 'akun.txt');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wib(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
}

function log(msg) {
  console.log(`${col('31', `[${wib()}]`)} ${msg}`);
}

// Baris info rata kiri: label disejajarkan, nilai merah tebal.
function infoRow(label, value) {
  console.log(`${label.padEnd(8, ' ')}: ${col('1;31', String(value))}`);
}

function printBanner() {
  const lines = ['Mas AL . Xyz', 'MyAgeApp Auto Farm', 'spin + daily + vault + tasks otomatis'];
  const w = Math.max(...lines.map((l) => l.length));
  const bar = '═'.repeat(w + 4);
  console.log(col('31', '╔' + bar + '╗'));
  lines.forEach((l, idx) => {
    const pad = w - l.length;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    const inner = '  ' + ' '.repeat(left) + l + ' '.repeat(right) + '  ';
    if (idx === 0) {
      // Nama: teks putih tebal di atas latar merah.
      console.log(col('31', '║') + col('1;41;97', inner) + col('31', '║'));
    } else {
      console.log(col('31', '║') + col('97', inner) + col('31', '║'));
    }
  });
  console.log(col('31', '╚' + bar + '╝'));
  const now = new Date();
  console.log(col('97', fmtDateID(now)));
}

function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${ss}d`;
  return `${ss}d`;
}

function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  return Number(n).toLocaleString('id-ID');
}

// ---------- warna + tanggal/jam ----------

// Warna ANSI hanya bila output ke terminal (TTY). Bila dialihkan ke file
// (mis. farm.log), tampil polos supaya log tetap bersih.
const USE_COLOR = !!process.stdout.isTTY;
function col(code, s) {
  return USE_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;
}

const dateFmtID = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
function fmtDateID(d) {
  return dateFmtID.format(d);
}

// Bersihkan layar (hanya di terminal; bila output dialihkan ke file, diam).
function clearScreen() {
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[0;0H');
}

// ---------- penyimpanan akun ----------

function loadAccounts() {
  try {
    const raw = fs.readFileSync(AKUN_FILE, 'utf8');
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return [...new Set(lines)];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function saveAccount(initData) {
  fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(AKUN_FILE, initData + '\n', { mode: 0o600 });
  try { fs.chmodSync(AKUN_FILE, 0o600); } catch {}
}

// ---------- input query_id ----------

// Satu interface readline untuk seluruh proses, dengan antrean baris sendiri.
// Alasan: rl.question() TIDAK menyimpan baris yang datang sebelum pertanyaan
// berikutnya diajukan — bila input datang cepat (pipe/paste), baris kedua
// hilang dan proses berhenti tanpa pesan. Antrean ini menyimpan baris yang
// datang lebih dulu, jadi menu -> login tetap jalan berurutan.
let RL = null;
const lineQueue = [];
let lineWaiter = null;
function getRL() {
  if (!RL) {
    RL = readline.createInterface({ input: process.stdin, output: process.stdout });
    RL.on('line', (line) => {
      if (lineWaiter) {
        const w = lineWaiter;
        lineWaiter = null;
        w(line);
      } else {
        lineQueue.push(line);
      }
    });
    // Ctrl+D (EOF): anggap user memilih keluar.
    RL.on('close', () => {
      if (lineWaiter) {
        const w = lineWaiter;
        lineWaiter = null;
        w('6');
      }
    });
  }
  return RL;
}
function closeRL() {
  if (RL) {
    try { RL.close(); } catch {}
    RL = null;
  }
}

function prompt(question) {
  const rl = getRL();
  rl.output.write(question);
  if (lineQueue.length) return Promise.resolve(lineQueue.shift());
  return new Promise((resolve) => { lineWaiter = resolve; });
}

function readClipboard() {
  return new Promise((resolve) => {
    execFile('termux-clipboard-get', (err, stdout) => {
      if (err) resolve({ ok: false, error: 'termux-clipboard-get gagal. Install aplikasi Termux:API dulu, lalu coba lagi.' });
      else resolve({ ok: true, text: stdout });
    });
  });
}

async function getPastedInput(argv) {
  const fileIdx = argv.indexOf('--file');
  if (fileIdx !== -1 && argv[fileIdx + 1]) {
    try {
      return fs.readFileSync(argv[fileIdx + 1], 'utf8');
    } catch (e) {
      console.error(`Tidak bisa baca file: ${e.message}`);
      return null;
    }
  }
  if (argv.includes('--clipboard')) {
    const r = await readClipboard();
    if (!r.ok) {
      console.error(r.error);
      return null;
    }
    return r.text;
  }
  return await prompt('Tempel query_id: ');
}

// ---------- panggilan klaim (tahan 409-reopen + retryable sekali) ----------

async function callClaim(api, method, label, ...args) {
  const key = newIdemKey();
  try {
    return await api[method](...args, key);
  } catch (e) {
    if (e.code === 'REOPEN') {
      log(`${label}: sesi dibuka ulang (409), ulangi sekali...`);
      await sleep(1000);
      await api.session();
      return await api[method](...args, key);
    }
    if (e.code === 'RETRYABLE') {
      await sleep(CONFIG.retryDelayMs);
      try { await api.session(); } catch {}
      return await api[method](...args, key);
    }
    throw e;
  }
}

// ---------- tugas otomatis ----------

// Klaim semua tugas yang bisa diklaim. Server yang memverifikasi tiap tugas
// (mis. sudah join channel atau belum) — bot tidak pernah memalsukan aksi.
// Tugas yang butuh tindakan user (screenshot, link X, nonton drama) dilewati
// dengan alasan yang jelas. Mengembalikan {claimed}.
async function runTasks(api, s, label) {
  const xLinked = !!(s.x && s.x.linked);
  let list;
  try {
    const r = await api.tasksGet();
    list = (r.data && r.data.tasks) || [];
  } catch (e) {
    if (e.code === 'AUTH' || e.code === 'BLOCKED') throw e;
    log(`${label}: daftar tugas gagal dimuat (${e.message}) — lewati.`);
    return { claimed: 0 };
  }
  if (!list.length) {
    log(`${label}: tidak ada tugas.`);
    return { claimed: 0 };
  }
  let claimed = 0;
  let n = 0;
  for (const t of list) {
    if (n >= CONFIG.maxTasksPerCycle) break;
    const d = decideTask(t, xLinked);
    const name = taskTitle(t);
    if (d.action === 'done' || d.action === 'cooldown') continue;
    if (d.action === 'skip-proof' || d.action === 'skip-xlink') {
      log(`${label}: TUGAS "${name}" dilewati — ${d.reason}.`);
      continue;
    }
    n++;
    try {
      if (d.action === 'watch') {
        await callClaim(api, 'tasksWatch', `${label} tugas "${name}"`, t.id);
        log(`${label}: TUGAS "${name}" — ronde tonton didaftarkan. Tonton episodenya di aplikasi, klaim menyusul di siklus berikut.`);
        continue;
      }
      const r = await callClaim(api, 'tasksClaim', `${label} tugas "${name}"`, t.id);
      claimed++;
      log(`${label}: TUGAS "${name}" diklaim — ${col('1;31', claimRewardText(r.data))}.`);
    } catch (e) {
      if (e.code === 'AUTH' || e.code === 'BLOCKED') throw e;
      log(`${label}: TUGAS "${name}" belum bisa diklaim (${String(e.message || e).slice(0, 120)}).`);
    }
    await sleep(CONFIG.taskDelayMs);
  }
  if (claimed === 0) log(`${label}: tidak ada tugas yang berhasil diklaim di siklus ini.`);
  return { claimed };
}

// ---------- perintah: login ----------

async function cmdLogin(argv) {
  const input = await getPastedInput(argv);
  if (input == null) {
    process.exitCode = 2;
    return;
  }
  const parsed = parseInitData(input);
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exitCode = 2;
    return;
  }
  if (parsed.warnOld) log('PERINGATAN: query_id sudah lebih dari 20 jam — sebentar lagi kedaluwarsa.');
  const api = new MyAgeApi(parsed.initData, CONFIG.apiBase, CONFIG.timeoutMs);
  let session;
  try {
    session = await api.session();
  } catch (e) {
    if (e.code === 'AUTH') {
      console.error('TIDAK VALID: server menolak initData ini (401). Tempel query_id MyAgeApp yang segar (buka lagi mini app-nya).');
      process.exitCode = 2;
      return;
    }
    if (e.code === 'BLOCKED') {
      console.error('Akun diblokir (403). Berhenti.');
      process.exitCode = 2;
      return;
    }
    console.error(`Gagal memeriksa sesi: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const s = session.data || {};
  const u = s.user || {};
  log(`Login OK: ${u.name || parsed.firstName || '(tanpa nama)'} (id ${u.id || parsed.userId})`);
  log(`Saldo: ${col('1;31', fmtNum(u.points))} AGE | ${col('1;31', fmtNum(u.gram))} GRAM`);
  saveAccount(parsed.initData);
  log(`Query_id tersimpan (mode 600).`);
  log('Lanjut: node myage.mjs check');
  log('lalu: node myage.mjs farm');
}

// ---------- perintah: check ----------

function spinStatus(s) {
  const sp = s.spin || {};
  if (sp.ready) return `SIAP (bonus: ${sp.bonus || 0})`;
  const rem = sp.resetInMs ?? s.resetInMs ?? null;
  return rem != null ? `berikutnya dalam ${fmtMs(rem)}` : 'belum siap';
}

function vaultStatus(s, nowMs) {
  const v = s.vault || {};
  if (v.worth != null && v.fullAt != null) {
    if (nowMs >= v.fullAt) return `PENUH (${fmtNum(v.worth)} AGE)`;
    return `${fmtNum(v.worth)} AGE (penuh dalam ${fmtMs(v.fullAt - nowMs)})`;
  }
  if (v.worth != null) return `${fmtNum(v.worth)} AGE`;
  return '-';
}

async function cmdCheck() {
  const accounts = loadAccounts();
  if (!accounts.length) {
    console.error('Belum ada akun. Jalankan dulu: node myage.mjs login');
    process.exitCode = 2;
    return;
  }
  for (let i = 0; i < accounts.length; i++) {
    const parsed = parseInitData(accounts[i]);
    const api = new MyAgeApi(accounts[i], CONFIG.apiBase, CONFIG.timeoutMs);
    let s;
    try {
      s = (await api.session()).data || {};
    } catch (e) {
      if (e.code === 'AUTH') {
        console.error(`[Akun ${i + 1}] TIDAK BERLAKU: initData kedaluwarsa/ditolak (401). Jalankan: node myage.mjs login`);
        continue;
      }
      console.error(`[Akun ${i + 1}] Gagal memuat sesi: ${e.message}`);
      continue;
    }
    const u = s.user || {};
    const nowMs = (s.serverNow || Date.now()) + 0;
    console.log(`\n${col('1;31', `=== Akun ${i + 1}: ${u.name || parsed.firstName || '-'} (id ${u.id || parsed.userId || '-'}) ===`)}`);
    infoRow('AGE', fmtNum(u.points));
    infoRow('GRAM', fmtNum(u.gram));
    infoRow('Spin', spinStatus(s));
    infoRow('Interval', `${s.spin?.everyHours ?? '-'} jam (bonus ${s.spin?.bonus || 0})`);
    infoRow('Daily', s.daily?.ready ? `SIAP (Day ${s.daily.day ?? '-'}, streak ${s.daily.streak ?? '-'})` : `sudah diklaim (Day ${s.daily?.day ?? '-'}, streak ${s.daily?.streak ?? '-'})`);
    infoRow('Vault', vaultStatus(s, nowMs));
    infoRow('Mystery', `${s.mystery?.left ?? 0} tersisa`);
    infoRow('Tag', s.tag?.paidToday ? 'sudah dibayar hari ini' : 'belum');
    infoRow('Bio', s.bio?.paidToday ? 'sudah dibayar hari ini' : 'belum');
  }
}

// ---------- perintah: tasks (daftar tugas + status) ----------

async function cmdTasks() {
  const accounts = loadAccounts();
  if (!accounts.length) {
    console.error('Belum ada akun. Jalankan dulu: node myage.mjs login');
    process.exitCode = 2;
    return;
  }
  for (let i = 0; i < accounts.length; i++) {
    const parsed = parseInitData(accounts[i]);
    const api = new MyAgeApi(accounts[i], CONFIG.apiBase, CONFIG.timeoutMs);
    let s;
    try {
      s = (await api.session()).data || {};
    } catch (e) {
      if (e.code === 'AUTH') {
        console.error(`[Akun ${i + 1}] TIDAK BERLAKU: initData kedaluwarsa/ditolak (401). Jalankan: node myage.mjs login`);
        continue;
      }
      console.error(`[Akun ${i + 1}] Gagal memuat sesi: ${e.message}`);
      continue;
    }
    const u = s.user || {};
    const xLinked = !!(s.x && s.x.linked);
    let list;
    try {
      const r = await api.tasksGet();
      list = (r.data && r.data.tasks) || [];
    } catch (e) {
      console.error(`[Akun ${i + 1}] Gagal memuat tugas: ${e.message}`);
      continue;
    }
    console.log(`\n=== Akun ${i + 1}: ${u.name || parsed.firstName || '-'} (id ${u.id || parsed.userId || '-'}) — X terhubung: ${xLinked ? 'ya' : 'tidak'} ===`);
    if (!list.length) {
      console.log('Tidak ada tugas.');
      continue;
    }
    for (const t of list) {
      const d = decideTask(t, xLinked);
      const reward = taskRewardText(t);
      const state = (d.action === 'claim' || d.action === 'check') ? col('1;31', 'SIAP DIKLAIM') : d.reason;
      console.log(`- ${taskTitle(t)} [${t.kind || '-'}]${reward ? ' ' + reward : ''} — ${state}`);
    }
  }
}

// ---------- perintah: farm ----------

async function farmCycle(api, label, once) {
  // Muat sesi segar; kembalikan ms tidur sampai siklus berikut (null = berhenti).
  let s;
  let loadedAt;
  try {
    const r = await api.session();
    s = r.data || {};
    loadedAt = Date.now();
  } catch (e) {
    if (e.code === 'AUTH') {
      log(`${label}: TIDAK BERLAKU — initData kedaluwarsa/ditolak (401). Jalankan: node myage.mjs login`);
      return { stop: true };
    }
    if (e.code === 'BLOCKED') {
      log(`${label}: akun diblokir (403). Berhenti.`);
      return { stop: true, fatal: true };
    }
    if (e.code === 'CLOSED') {
      const wait = Math.min(e.opensInMs || 3600000, 6 * 3600 * 1000);
      log(`${label}: aplikasi tutup sementara. Tidur ${fmtMs(wait)}.`);
      return { sleepMs: wait };
    }
    log(`${label}: sesi gagal (${e.message}). Tidur 5 menit.`);
    return { sleepMs: 5 * 60 * 1000 };
  }

  const u = s.user || {};
  const nowMs = (s.serverNow || Date.now()) + (Date.now() - loadedAt);
  log(`${label}: ${u.name || ''} — AGE ${col('1;31', fmtNum(u.points))} | GRAM ${col('1;31', fmtNum(u.gram))}`);

  // Tugas otomatis dulu — tugas bisa memberi bonus spin, jadi klaim sebelum spin.
  let claimedTasks = 0;
  try {
    const tr = await runTasks(api, s, label);
    claimedTasks = tr.claimed;
  } catch (e) {
    if (e.code === 'AUTH') return { stop: true };
    if (e.code === 'BLOCKED') return { stop: true, fatal: true };
    log(`${label}: tugas gagal (${e.message}).`);
  }
  if (claimedTasks > 0) {
    // Muat ulang sesi supaya saldo + bonus spin dari tugas ikut terhitung.
    try {
      const r = await api.session();
      s = r.data || {};
      loadedAt = Date.now();
    } catch {}
  }

  // Welcome (sekali saja).
  try {
    if (s.welcome && s.welcome.claimed === false) {
      const r = await callClaim(api, 'welcome', `${label} welcome`);
      log(`${label}: welcome diklaim (+${col('1;31', fmtNum(r.data?.points ?? r.data?.welcome?.total))} AGE).`);
    }
  } catch (e) {
    log(`${label}: welcome gagal (${e.message}).`);
  }

  // Spin gratis (+ bonus spin selama masih ada).
  try {
    let spins = 0;
    let bonusLeft = s.spin?.bonus || 0;
    let ready = !!s.spin?.ready;
    while ((ready || bonusLeft > 0) && spins < CONFIG.maxSpinsPerCycle) {
      const r = await callClaim(api, 'spin', `${label} spin`);
      const d = r.data || {};
      spins++;
      if (d.kind === 'gram') log(`${label}: SPIN menang ${col('1;31', fmtNum(d.amount))} GRAM (saldo ${col('1;31', fmtNum(d.gramBalance))}).`);
      else if (d.serial) log(`${label}: SPIN menang Whitelist Pass (serial ${d.serial}).`);
      else log(`${label}: SPIN menang ${col('1;31', fmtNum(d.amount))} AGE (saldo ${col('1;31', fmtNum(d.points))}).`);
      bonusLeft = d.bonusLeft ?? 0;
      ready = false;
      if (bonusLeft > 0) await sleep(CONFIG.spinDelayMs);
    }
    if (spins > 0) {
      // Muat ulang sesi supaya timer/resetInMs segar.
      try {
        const r = await api.session();
        s = r.data || {};
        loadedAt = Date.now();
      } catch {}
    }
  } catch (e) {
    if (e.code === 'AUTH') return { stop: true };
    log(`${label}: spin gagal (${e.message}).`);
  }

  // Daily.
  try {
    if (s.daily?.ready) {
      const r = await callClaim(api, 'daily', `${label} daily`);
      const d = r.data || {};
      log(`${label}: DAILY diklaim — Day ${d.day ?? s.daily.day} (streak ${d.streak ?? s.daily.streak}), +${col('1;31', fmtNum(d.reward))} AGE (saldo ${col('1;31', fmtNum(d.points))}).`);
    }
  } catch (e) {
    if (e.code === 'AUTH') return { stop: true };
    log(`${label}: daily gagal (${e.message}).`);
  }

  // Vault (klaim AGE per jam bila penuh).
  try {
    const v = s.vault || {};
    const worth = v.worth ?? 0;
    if (v.fullAt != null && nowMs >= v.fullAt && worth > 0) {
      const r = await callClaim(api, 'vault', `${label} vault`);
      log(`${label}: VAULT diklaim +${col('1;31', fmtNum(r.data?.amount))} AGE.`);
    }
  } catch (e) {
    if (e.code === 'AUTH') return { stop: true };
    log(`${label}: vault gagal (${e.message}).`);
  }

  // Tag harian (bila tag ada di nama & belum dibayar hari ini).
  try {
    const t = s.tag || {};
    if (t.daily > 0 && t.inName && !t.paidToday) {
      const r = await callClaim(api, 'tag', `${label} tag`);
      log(`${label}: TAG diklaim +${col('1;31', fmtNum(r.data?.reward))} AGE (streak ${r.data?.streak}).`);
    }
  } catch (e) {
    if (e.code === 'AUTH') return { stop: true };
    log(`${label}: tag gagal (${e.message}) — lewati.`);
  }

  // Bio harian (bila belum dibayar hari ini; 400 = link belum ada di bio, lewati).
  try {
    const b = s.bio || {};
    if (!b.paidToday) {
      const r = await callClaim(api, 'bio', `${label} bio`);
      log(`${label}: BIO diklaim +${col('1;31', fmtNum(r.data?.reward))} AGE (streak ${r.data?.streak}).`);
    }
  } catch (e) {
    if (e.code === 'AUTH') return { stop: true };
    log(`${label}: bio gagal (${e.message}) — lewati.`);
  }

  // Mystery spin.
  try {
    let left = s.mystery?.left || 0;
    let n = 0;
    while (left > 0 && n < CONFIG.maxMysteryPerCycle) {
      const r = await callClaim(api, 'mystery', `${label} mystery`);
      const d = r.data || {};
      n++;
      if (d.kind === 'premium') log(`${label}: MYSTERY menang Telegram Premium!`);
      else log(`${label}: MYSTERY menang ${col('1;31', fmtNum(d.amount ?? 0))} (sisa ${d.left ?? 0}).`);
      left = d.left ?? 0;
      if (left > 0) await sleep(CONFIG.spinDelayMs);
    }
  } catch (e) {
    if (e.code === 'AUTH') return { stop: true };
    log(`${label}: mystery gagal (${e.message}).`);
  }

  if (once) return { sleepMs: 0, done: true };

  // Hitung tidur sampai spin berikutnya (dari sesi terakhir), maks 60 menit.
  const resetInMs = s.spin?.resetInMs ?? s.resetInMs ?? null;
  let sleepMs;
  if (resetInMs != null) {
    const elapsed = Date.now() - loadedAt;
    sleepMs = resetInMs - elapsed;
  } else if (s.spin?.everyMs) {
    sleepMs = s.spin.everyMs;
  } else {
    sleepMs = CONFIG.maxSleepMs;
  }
  sleepMs = Math.max(CONFIG.minSleepMs, Math.min(sleepMs, CONFIG.maxSleepMs));
  return { sleepMs };
}

async function cmdFarm(argv) {
  const once = argv.includes('--once');
  const accounts = loadAccounts();
  if (!accounts.length) {
    console.error('Belum ada akun. Jalankan dulu: node myage.mjs login');
    process.exitCode = 2;
    return;
  }
  log(`Farm mulai — ${accounts.length} akun.`);
  log('Hanya klaim gratis.');
  log('Berhenti: Ctrl+C');
  log('atau: pkill -f "node myage.mjs farm"');
  const dead = new Set();
  let fatal = false;
  while (!fatal) {
    let nextSleep = CONFIG.maxSleepMs;
    for (let i = 0; i < accounts.length; i++) {
      if (dead.has(i)) continue;
      const label = `[Akun ${i + 1}]`;
      const api = new MyAgeApi(accounts[i], CONFIG.apiBase, CONFIG.timeoutMs);
      const res = await farmCycle(api, label, once);
      if (res.stop) {
        dead.add(i);
        if (res.fatal) fatal = true;
      } else if (res.sleepMs != null) {
        nextSleep = Math.min(nextSleep, res.sleepMs);
      }
      if (once && res.done) {
        log('Sekali jalan selesai.');
        return;
      }
      await sleep(2000);
    }
    if (dead.size === accounts.length) {
      console.error('Semua akun tidak berlaku. Jalankan: node myage.mjs login');
      process.exitCode = 2;
      return;
    }
    if (once) return;
    if (fatal) {
      process.exitCode = 1;
      return;
    }
    await sleepCountdown(nextSleep);
  }
}

// ---------- menu interaktif ----------

// Dijalankan bila user hanya mengetik: node myage.mjs
// Pilih angka, selesai, kembali ke menu. Keluar dengan angka 6.
// Satu layar perintah: bersihkan layar, banner tetap di atas, hasil di bawahnya,
// lalu "Tekan Enter" untuk kembali ke menu.
async function runScreen(fn) {
  clearScreen();
  printBanner();
  await fn();
  console.log('');
  await prompt('Tekan Enter untuk kembali...');
}

async function cmdMenu() {
  for (;;) {
    clearScreen();
    printBanner();
    console.log('Pilih menu (ketik angka):');
    console.log('');
    console.log('  ' + col('1;31', '1.') + ' Login (tempel query_id)');
    console.log('  ' + col('1;31', '2.') + ' Check saldo + status');
    console.log('  ' + col('1;31', '3.') + ' Lihat tugas');
    console.log('  ' + col('1;31', '4.') + ' Farm (loop otomatis)');
    console.log('  ' + col('1;31', '5.') + ' Farm sekali saja');
    console.log('  ' + col('1;31', '6.') + ' Keluar');
    const ans = (await prompt('Pilih [1-6]: ')).trim();
    if (ans === '1') await runScreen(() => cmdLogin([]));
    else if (ans === '2') await runScreen(() => cmdCheck());
    else if (ans === '3') await runScreen(() => cmdTasks());
    else if (ans === '4') await runScreen(() => cmdFarm([]));
    else if (ans === '5') await runScreen(() => cmdFarm(['--once']));
    else if (ans === '6' || ans.toLowerCase() === 'q') {
      process.exitCode = 0;
      console.log('Sampai jumpa.');
      return;
    } else {
      console.log('Pilihan tidak dikenal. Ketik 1-6.');
      await prompt('Tekan Enter untuk kembali...');
    }
  }
}

function printHelp() {
  console.log('Perintah:');
  console.log('  login');
  console.log('    Tempel query_id MyAgeApp.');
  console.log('    Validasi + simpan.');
  console.log('    --clipboard / --file <path>');
  console.log('  check');
  console.log('    Saldo AGE/GRAM.');
  console.log('    Status spin, daily, vault.');
  console.log('  tasks');
  console.log('    Daftar tugas + statusnya.');
  console.log('  farm [--once]');
  console.log('    Loop otomatis: tugas, spin,');
  console.log('    daily, vault, tag/bio, mystery.');
}

// ---------- main ----------

const cmd = process.argv[2];
const argv = process.argv.slice(3);

process.on('SIGINT', () => {
  console.log('\nBerhenti.');
  process.exit(0);
});

if (cmd === 'login') { printBanner(); await cmdLogin(argv); }
else if (cmd === 'check') { printBanner(); await cmdCheck(); }
else if (cmd === 'farm') { printBanner(); await cmdFarm(argv); }
else if (cmd === 'tasks') { printBanner(); await cmdTasks(); }
else if (cmd === 'help' || cmd === '--help' || cmd === '-h') { printBanner(); printHelp(); }
else if (!cmd) { await cmdMenu(); }
else {
  printBanner();
  printHelp();
  process.exit(2);
}
closeRL();
