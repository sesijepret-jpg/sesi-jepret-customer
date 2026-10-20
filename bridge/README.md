# SesiJepret Camera Bridge (Canon EOS M50)

Bridge ini harus berjalan di **komputer Windows yang terhubung langsung ke EOS M50 lewat micro USB**. Website yang dibuka pada komputer yang sama memanggil `http://127.0.0.1:8765`. Pratinjau berasal dari Canon EDSDK live view; tombol foto memerintahkan shutter kamera dan menerima JPEG hasil jepretan. Website tidak mengambil screenshot video.

## Menjalankan

1. Nyalakan EOS M50 dalam mode foto, hubungkan micro USB, dan pastikan Wi-Fi kamera tidak sedang tersambung. Bridge mengubah JPEG S1 ke **JPEG Large/Fine** hanya selama jepretan, lalu mengembalikan pengaturan semula. Jika memakai RAW+JPEG, kedua file disimpan sebagai cadangan di folder `captures/`.
2. Instal Python 3.10+ dan EDSDK Canon untuk Windows. Di komputer pengembangan ini EDSDK.dll tersedia di `C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll`. Untuk komputer kios lain, peroleh paket EDSDK resmi dari Canon dan atur `SESI_JEPRET_EDSDK_DLL` ke lokasi DLL tersebut.
3. Jalankan `start-camera-bridge.cmd`, atau `python canon_bridge.py`. Biarkan jendelanya terbuka selama sesi photobooth.
4. Buka website SesiJepret di **komputer yang sama**. Halaman kamera akan mendeteksi bridge secara otomatis. Jika domain website berubah, jalankan bridge dengan `--origin https://domain-baru.example`.

Pada Chrome versi baru, website publik yang menghubungi `127.0.0.1` dapat memunculkan permintaan izin **Local network access**. Izinkan untuk domain SesiJepret agar browser dapat menghubungi bridge. Jangan menonaktifkan perlindungan browser.

`GET /health` memeriksa sesi kamera, `GET /preview` mengirim frame live view JPEG, dan `POST /capture` memotret melalui shutter Canon lalu mengirim JPEG asli. Bridge hanya mendengarkan di `127.0.0.1` dan hanya menerima permintaan browser dari origin yang diizinkan. Tombol foto akan menampilkan kesalahan bila bridge atau kamera tidak tersedia, tanpa diam-diam menyimpan frame webcam.

Website yang dibuka di ponsel atau tablet lain tidak dapat mengakses bridge di komputer ini melalui `127.0.0.1`. Kios harus menjalankan browser dan bridge pada komputer Windows yang sama.

## Tes cepat

```powershell
curl.exe http://127.0.0.1:8765/health
curl.exe -H "X-SesiJepret-Bridge: 1" -X POST -o tes.jpg http://127.0.0.1:8765/capture
```

Jika EOS Webcam Utility sedang menggunakan kamera, tutup aplikasi yang memakai webcam tersebut dan ulangi. Bridge memulihkan pengaturan lokasi penyimpanan serta live view saat ditutup normal.
