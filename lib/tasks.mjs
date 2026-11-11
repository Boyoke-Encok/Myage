// Keputusan per tugas MyAgeApp, meniru questState() di bundle resmi (myageapp.xyz).
// TIDAK ada pemalsuan: bot hanya memanggil endpoint yang sama seperti aplikasi,
// dan SERVER yang memutuskan apakah tugas sudah selesai (join channel, dsb.).
// Yang TIDAK bisa otomatis: upload screenshot bukti, link akun X, dan menonton
// episode drama — ketiganya butuh tindakan user di aplikasi.

function fmtMsLocal(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${ss}d`;
  return `${ss}d`;
}

function fmtNumLocal(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  return Number(n).toLocaleString('id-ID');
}

// action: 'done' | 'cooldown' | 'skip-proof' | 'skip-xlink' | 'watch' | 'check' | 'claim'
export function decideTask(t, xLinked) {
  if (!t || typeof t !== 'object') return { action: 'done', reason: 'tugas kosong' };
  if (t.done) {
    return (t.reopensInMs !== null && t.reopensInMs !== undefined)
      ? { action: 'done', reason: `selesai, buka lagi dalam ${fmtMsLocal(t.reopensInMs)}` }
      : { action: 'done', reason: 'selesai' };
  }
  if (t.waitLeftMs > 0) return { action: 'cooldown', reason: `tunggu ${fmtMsLocal(t.waitLeftMs)}` };
  if (t.kind === 'proof') return { action: 'skip-proof', reason: 'butuh upload screenshot bukti — kerjakan manual di aplikasi' };
  if (t.kind === 'x_follow' && !xLinked) return { action: 'skip-xlink', reason: 'butuh link akun X dulu' };
  if (t.kind === 'drama') {
    return t.opened
      ? { action: 'check', reason: 'cek sudah nonton atau belum' }
      : { action: 'watch', reason: 'daftarkan ronde tonton' };
  }
  return { action: 'claim', reason: 'klaim (server memverifikasi)' };
}

export function taskTitle(t) {
  return String((t && (t.title || t.id)) || 'tugas');
}

export function taskRewardText(t) {
  const parts = [];
  if (t.reward > 0) parts.push(`+${fmtNumLocal(t.reward)} AGE`);
  if (t.gram > 0) parts.push(`+${fmtNumLocal(t.gram)} GRAM`);
  if (t.spins > 0) parts.push(`+${t.spins} spin`);
  if (t.epic > 0) parts.push(`+${t.epic} epic spin`);
  return parts.join(' ');
}

// Teks hadiah dari respons klaim POST /api/tasks {taskId}:
// {paid (AGE), gramPaid, gramBalance, spinsPaid, epicPaid, points, task, spins{bonus,mystery,epic}}
export function claimRewardText(d) {
  if (!d || typeof d !== 'object') return 'klaim berhasil';
  const parts = [];
  if (d.paid > 0) parts.push(`+${fmtNumLocal(d.paid)} AGE`);
  if (d.gramPaid > 0) parts.push(`+${fmtNumLocal(d.gramPaid)} GRAM`);
  if (d.spinsPaid > 0) parts.push(`+${d.spinsPaid} spin`);
  if (d.epicPaid > 0) parts.push(`+${d.epicPaid} epic spin`);
  return parts.length ? parts.join(', ') : 'klaim berhasil';
}
