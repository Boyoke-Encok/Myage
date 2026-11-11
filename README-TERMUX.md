# MyAgeApp — Bot Termux (spin + daily + tugas otomatis)

Bot untuk mini app Telegram **@MyAgeApp** (https://myageapp.xyz): klaim **spin gratis**,
**daily reward**, **vault** (AGE per jam), **mystery spin**, **tag** dan **bio** — semuanya
gratis — plus **menyelesaikan tugas (tasks) yang bisa diklaim**, loop otomatis sesuai
durasi dari server.

## Yang TIDAK dilakukan bot ini

- Tidak withdraw GRAM (butuh dompet TON + minimal 0,5 GRAM — putuskan sendiri).
- Tidak mint/pass, tidak spin berbayar, tidak connect wallet.
- Tidak mengerjakan tasks (follow channel, X, dsb.), tidak posting, tidak share.
- Tidak pernah meminta seed phrase / private key / kata sandi.

## Tugas otomatis (baru)

Setiap siklus farm, bot memuat daftar tugas (`GET /api/tasks`) lalu mencoba klaim
satu per satu — persis seperti tombol Claim/Check di aplikasi. **Server yang
memutuskan** apakah tugas sudah selesai (mis. sudah join channel atau belum); bot
tidak pernah memalsukan aksi apa pun.

- Tugas yang sudah selesai → diklaim, hadiah dicatat (AGE / GRAM / bonus spin /
  epic spin). Tugas bisa memberi bonus spin — makanya tugas dikerjakan SEBELUM spin.
- Tugas drama (iLoveDrama) → bot hanya mendaftarkan ronde tonton; episodenya tetap
  harus ditonton di aplikasi, klaim menyusul di siklus berikut bila server bilang
  sudah nonton.
- Tugas yang dilewati (dengan alasan di log): butuh **upload screenshot bukti**,
  butuh **link akun X** dulu, atau masih **cooldown/timer**.
- Tugas yang aksinya belum dilakukan (mis. belum join channel) → server menolak,
  bot mencatat pesannya dan lanjut ke tugas berikut.

Lihat daftar tugas + statusnya kapan saja:

```bash
node myage.mjs tasks
```

## Yang TIDAK dilakukan bot ini

- Tidak withdraw GRAM (butuh dompet TON + minimal 0,5 GRAM — putuskan sendiri).
- Tidak mint/pass, tidak spin berbayar, tidak connect wallet.
- Tidak mengerjakan tugas yang butuh aksi nyata di luar API: upload screenshot,
  link akun X, menonton episode drama, join channel/chat — semua itu tetap
  dikerjakan user di aplikasi; bot hanya mengklaim sesudah server memverifikasi.
- Tidak pernah meminta seed phrase / private key / kata sandi.

## Cara dapat query_id

1. Di Telegram, buka **@MyAgeApp** → buka mini app-nya.
2. Ketuk **⋯** → **"Open in Browser"** (di HP) atau di Telegram Desktop → mini app → ⋯ →
   "Open in browser". Salin URL lengkapnya (berisi `tgWebAppData=...`).
3. Di Termux, jalankan `node myage.mjs login` lalu tempel URL itu.
   - Atau tanpa tempel: salin URL dulu di HP, lalu `node myage.mjs login --clipboard`
     (butuh aplikasi Termux:API).
   - Atau simpan URL ke file lalu `node myage.mjs login --file <path>`.
4. Script memvalidasi query_id (format lengkap + masih berlaku) lalu memeriksa sesi
   langsung ke server. Bila benar, query_id tersimpan di `~/.myage/akun.txt` (mode 600).
   Bila salah/kedaluwarsa, script menolak dan tidak menyimpan apa pun.

**Catatan:** query_id berlaku ~24 jam. Bila farm berhenti dengan pesan "TIDAK BERLAKU",
ulangi langkah di atas untuk query_id yang baru. Login pakai **user ID saja tidak bisa** —
server memeriksa tanda tangan HMAC Telegram di initData (sudah terbukti: initData palsu
dengan user ID asli langsung ditolak 401).

## Setup (sekali saja)

```bash
pkg update -y && pkg install -y nodejs termux-api
chmod +x setup-termux.sh run-farm.sh
./setup-termux.sh
```

Tidak perlu `npm install` — script ini hanya memakai bawaan Node.js.

## Perintah

Cukup ketik `node myage.mjs` — menu muncul, tinggal pilih angka:

```
  1. Login (tempel query_id)
  2. Check saldo + status
  3. Lihat tugas
  4. Farm (loop otomatis)
  5. Farm sekali saja
  6. Keluar
```

Banner tampil **merah-putih** (nama putih tebal di atas latar merah, bingkai merah),
dengan tanggal di bawahnya (mis. "Rabu, 11 November 2026"). Setiap layar dimulai
dengan membersihkan layar, banner selalu di atas, hasil perintah di bawahnya, lalu
"Tekan Enter untuk kembali..." — sesudah Enter, kembali ke menu. Warna hanya aktif
di terminal; bila output dialihkan ke file (mis. `farm.log`), tampil polos supaya
log tetap bersih.

Tampilan info juga merah dan sejajar: `check` menampilkan label rata kiri
(AGE, GRAM, Spin, Interval, Daily, Vault, Mystery, Tag, Bio) dengan nilainya
merah tebal; jam di tiap baris log farm merah; hadiah klaim (AGE/GRAM/spin)
merah. Saat farm tidur menunggu spin berikutnya, tampil **hitung mundur yang
berjalan tiap detik** di baris yang sama (sisa waktu berdetak, merah).

Perintah langsung (untuk script / `run-farm.sh`) tetap bisa:

```bash
node myage.mjs login [--clipboard | --file <path>]   # simpan query_id baru
node myage.mjs check                                  # saldo AGE/GRAM + status spin/daily/vault
node myage.mjs tasks                                  # daftar tugas + status (siap diklaim / butuh aksi manual)
node myage.mjs farm                                   # loop otomatis selamanya
node myage.mjs farm --once                            # satu putaran saja, lalu berhenti
node myage.mjs help                                   # daftar perintah
./run-farm.sh                                         # farm di background (log: farm.log)
```

Berhenti: `Ctrl+C`, atau `pkill -f "node myage.mjs farm"`.

## Cara kerja loop

1. Muat sesi (`POST /api/session`) → baca state + timer dari server.
2. Muat daftar tugas (`GET /api/tasks`) → klaim yang sudah bisa diklaim; yang butuh
   aksi manual (screenshot, link X, nonton drama, join channel) dilewati dengan
   alasan yang jelas. Bila ada tugas yang berhasil diklaim, sesi dimuat ulang
   supaya bonus spin dari tugas ikut terhitung.
3. Spin bila `ready` (ulangi selama masih ada bonus spin).
3. Klaim daily bila `ready` (siklus 7 hari, 24 jam).
4. Klaim vault bila sudah penuh (AGE per jam, maks ~8 jam).
5. Klaim tag/bio harian bila belum dibayar hari itu.
6. Mystery spin bila masih ada sisa.
7. Tidur sampai spin gratis berikutnya (dari `resetInMs` server, maks 60 menit),
   lalu ulangi dari langkah 1. Sesi dimuat ulang tiap putaran.

Bila server menjawab 401 → query_id kedaluwarsa, bot berhenti dan minta login ulang.
Bila 409 (reopen) → sesi dimuat ulang sekali lalu klaim diulang dengan kunci yang sama.
Bila 503 (aplikasi tutup) → tidur sampai waktu buka yang diberikan server.
Bila jaringan/429/5xx → tunggu 4 detik, muat ulang sesi, coba sekali lagi.

## Peringatan

Bot/script otomatis **bisa melanggar ketentuan MyAgeApp** dan berisiko akun dibatasi
atau kehilangan kelayakan airdrop — sama seperti game Telegram lain yang melarang bot.
Saya belum membaca teks Terms of Use MyAgeApp; jalankan atas risiko sendiri. Nilai
$AGE/$GRAM belum jelas dan spekulatif (listing/TGE disebut berbeda-beda di tiap sumber).

## Troubleshooting

- `TIDAK VALID: field hilang: ...` → tempelan terpotong. Salin dari awal (di Chrome
  ketuk address bar lalu ikon salin, jangan seleksi manual).
- `TIDAK BERLAKU` / `401` → query_id sudah lewat 24 jam. Ambil yang baru, `login` ulang.
- `Akun diblokir (403)` → berhenti; akun perlu dicek manual di aplikasi.
- Spin tidak jalan padahal `check` bilang SIAP → kirim isi `farm.log` terakhir.
