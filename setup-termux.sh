#!/data/data/com.termux/files/usr/bin/bash
# Setup awal MyAgeApp bot di Termux. Jalankan sekali di folder ini.
set -e
pkg update -y
pkg install -y nodejs termux-api
node --version
chmod +x myage.mjs run-farm.sh
echo ""
echo "Siap. Langkah berikut:"
echo "  node myage.mjs lo "