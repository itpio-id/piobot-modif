# Setup workspace privat PioBot

Kalender, Drive/ClickUp tim, PioSales, dan pengaturan akses memakai sesi pemilik atau Admin.

## Supabase

1. Buka Supabase project PioSales (`kuupfncfzzghedhbvxkj`) → SQL Editor.
2. Jalankan seluruh isi `supabase/piobot_unified_workspace.sql`.
3. Di Vercel → Project `itpioassistv2` → Settings → Environment Variables, tambahkan `SUPABASE_SERVICE_ROLE_KEY` untuk Production. Ambil key dari Supabase **Project Settings → API Keys → service_role/secret**. Jangan masukkan ke browser, Git, atau chat.
4. Deploy ulang setelah secret ditambahkan.

Migrasi mengunci invoice dari akses browser anonim dan memberi API server akses menggunakan role service. Tanpa migrasi dan secret server, login Google tetap bisa berjalan, tetapi staf, PioSales, penyimpanan OAuth bersama, dan notifikasi tidak aktif.

## Google dan Admin

- Login pemilik memakai Google dengan email `itpio@itpio.id`.
- Setelah migrasi aktif, pemilik dapat memilih **Pengaturan akses Admin** untuk membuat kode aktivasi acak 8 karakter. Kode hanya ditampilkan sekali dan Admin membuat sandi pribadi minimal 12 karakter setelah aktivasi.
- Reset kode langsung membatalkan akses sandi Admin dan sesi Admin sebelumnya.
- Admin hanya dapat membuat task pada list bernama atau berada di ruang/folder PioGrowth/PioStudio. Untuk membatasi list lebih ketat, atur `PIOBOT_STAFF_CLICKUP_LIST_IDS` ke daftar ID ClickUp yang diizinkan.
- Akses Drive Admin dibatasi pada dokumen draf yang dibuat PioBot dan diberi metadata `piobot-content-draft`.

## Pengingat browser

`SUPABASE_URL`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, dan `OWNER_EMAIL` sudah ditambahkan ke environment Production. Kunci VAPID disimpan sebagai secret Vercel dan tidak disimpan di repo.

Di Vercel, Cron per menit memerlukan paket Pro. Pemilik juga perlu mengaktifkan izin notifikasi browser di panel PioBot. Pengingat dikirim satu jam sebelum acara; ringkasan agenda mingguan dikirim Minggu pukul 19.00 WIB. Email tidak digunakan.
