# Pengingat PioBot melalui cron-job.org

Pengingat kalender menggunakan endpoint PioBot yang dilindungi `CRON_SECRET`. Cron Vercel dihapus agar pengingat tidak bergantung pada jadwal paket Hobby.

Sebelum mengaktifkan job, pastikan Production di Vercel memiliki `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, dan koneksi Google pemilik. Pada pemeriksaan terakhir, `SUPABASE_SERVICE_ROLE_KEY` belum ada di Production, jadi endpoint sengaja mengembalikan `503` sampai kunci itu ditambahkan.

## Buat job

Di [cron-job.org](https://cron-job.org/), buat job dengan nilai berikut:

- URL: `https://pioassist.itpio.id/api/cron/reminders`
- Metode: `GET`
- Jadwal: setiap 1 menit
- Header khusus:
  - Nama: `Authorization`
  - Nilai: `Bearer <nilai CRON_SECRET dari Vercel>`

Jangan masukkan token ke URL, chat, atau repository. Simpan hanya sebagai header job. Aktifkan pemberitahuan gagal di cron-job.org agar kamu tahu jika job berhenti berjalan.

## Perilaku

- Pengingat acara diproses dalam jendela 45–75 menit sebelum mulai. Jendela ini membantu mengatasi keterlambatan kecil pada scheduler.
- Ringkasan agenda berikutnya diproses pada hari Minggu pukul 19.00–19.59 WIB. Deduplication di database memastikan satu ringkasan per Minggu.
- Endpoint tetap memerlukan koneksi Google pemilik, Supabase, dan kunci VAPID. Izin notifikasi browser harus aktif dan perangkat/browser harus sudah berlangganan push.
- cron-job.org mendukung jadwal per menit dan header khusus, tetapi tidak menjamin waktu eksekusi persis dan memiliki batas waktu respons 30 detik. Jika permintaan gagal, lihat riwayat eksekusinya.

## Uji job

Gunakan tombol **Test run** setelah header rahasia disimpan. Respons `200` dengan `sent: 0` normal jika belum ada acara dalam jendela pengingat atau belum ada perangkat yang berlangganan. Respons `401` berarti header/`CRON_SECRET` tidak cocok. Respons `503` berarti ada koneksi layanan yang perlu diperiksa.
