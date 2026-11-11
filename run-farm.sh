#!/data/data/com.termux/files/usr/bin/bash
# Jalankan farm MyAgeApp di background (tetap jalan walau Termux diminimalkan).
cd "$(dirname "$0")"
termux-wake-lock
nohup node myage.mjs farm >> farm.log 2>&1 &
echo "Farm jalan di background (PID $!). Log: farm.log"
echo "Lihat log: tail -f farm.log"
echo "Berhenti: pkill -f 'node myage.mjs farm'"
