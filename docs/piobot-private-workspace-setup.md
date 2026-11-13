# Setup workspace privat PioBot

Fitur chat umum dan riset harga tetap publik. Kalender, Drive/ClickUp tim, PioSales, dan pengaturan staf memakai sesi pemilik atau reviewer.

## Supabase

1. Buka Supabase project PioSales (`kuupfncfzzghedhbvxkj`) → SQL Editor.
2. Jalankan seluruh isi `supabase/piobot_unified_workspace.sql`.
3. Di Vercel → Project `itpioassistv2` → Settings → Environment Variables, tambahkan `SUPABASE_SERVICE_ROLE_KEY` untuk Production. Ambil key dari Supabase **Project Settings → API Keys → service_role/secret**. Jangan masukkan ke browser, Git, atau chat.
4. Deploy ulang setelah secret ditambahkan.

Migrasi mengunci invoice dari akses browser anonim dan memberi API server akses menggunakan role service. Tanpa migrasi dan secret server, login Google tetap bisa berjalan, tetapi staf, PioSales, penyimpanan OAuth bersama, dan notifikasi tidak aktif.

## Google dan reviewer

- Login pemilik memakai Google dengan email `itpio@itpio.id`.
- Setelah migrasi aktif, pemilik dapat memilih **Reset kode reviewer**. PioBot membuat kode aktivasi acak 8 karakter, menampilkannya sekali, dan meminta reviewer menggantinya dengan sandi pribadi minimal 12 karakter.
- Reset kode membatalkan sesi reviewer yang sedang berjalan.
- Reviewer hanya dapat membuat task pada list bernama atau berada di ruang/folder PioGrowth/PioStudio. Untuk membatasi list lebih ketat, atur `PIOBOT_STAFF_CLICKUP_LIST_IDS` ke daftar ID ClickUp yang diizinkan.
- Akses Drive reviewer dibatasi pada dokumen draf yang dibuat PioBot dan diberi metadata `piobot-content-draft`.

## Pengingat browser

`SUPABASE_URL`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, dan `OWNER_EMAIL` sudah ditambahkan ke environment Production. Kunci VAPID disimpan sebagai secret Vercel dan tidak disimpan di repo.

Di Vercel, Cron per menit memerlukan paket Pro. Pemilik juga perlu mengaktifkan izin notifikasi browser di panel PioBot. Pengingat dikirim satu jam sebelum acara; ringkasan agenda mingguan dikirim Minggu pukul 19.00 WIB. Email tidak digunakan.
