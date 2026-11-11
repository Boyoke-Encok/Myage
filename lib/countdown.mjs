// Hitung mundur tidur farm — jam berjalan (live countdown).
// Di terminal: tulis ulang baris yang sama tiap detik (sisa waktu berdetak).
// Bila output bukan terminal: satu baris statis lalu tidur biasa.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USE_COLOR = !!process.stdout.isTTY;
function col(code, s) {
  return USE_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;
}

const wibFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
function wib(d = new Date()) {
  return wibFmt.format(d);
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

export async function sleepCountdown(ms) {
  const target = new Date(Date.now() + ms);
  const targetStr = `${wib(target)} WIB`;
  const line = (leftMs) =>
    `[${wib()}] tidur ${col('1;31', fmtMs(Math.max(leftMs, 0)))} — spin berikutnya ~${targetStr}.`;
  if (!process.stdout.isTTY) {
    console.log(line(ms));
    await sleep(ms);
    return;
  }
  const end = Date.now() + ms;
  process.stdout.write('\r\x1b[2K' + line(end - Date.now()));
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const left = end - Date.now();
      if (left <= 0) {
        clearInterval(timer);
        process.stdout.write('\n');
        resolve();
        return;
      }
      process.stdout.write('\r\x1b[2K' + line(left));
    }, 1000);
  });
}
