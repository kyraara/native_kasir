# Deploy Native Motor ke cPanel (Rumahweb)

Panduan ini untuk hosting cPanel yang punya menu **Setup Node.js App** (CloudLinux).
Waktu yang dibutuhkan: ±20 menit.

---

## 0. Di komputer sendiri: buat paket

```bash
npm run package
```

Hasilnya `deploy/native-motor-deploy.zip` (±1 MB). Isinya aplikasi yang sudah di-build, jadi hosting
tidak perlu Vite/TypeScript dan `npm install` di hosting hanya memasang 5 paket (±56 MB).

> Model **kemiripan foto lokal** tidak disertakan (butuh ±450 MB disk & ±1 GB RAM, biasanya melebihi
> paket shared hosting). Cari pakai foto tetap berjalan lewat **Gemini** (bacaan AI + part number).
> Jika hosting Anda kuat (Cloud/VPS), pakai `npm run package -- --with-vision` dan jangan isi `VISION_ENABLED=false`.

## 1. Buat database

cPanel → **MySQL® Databases**

1. *Create New Database* → mis. `kasir` (nama lengkapnya jadi `userCpanel_kasir`).
2. *Add New User* → mis. `kasir`, buat password kuat (jadi `userCpanel_kasir`).
3. *Add User To Database* → pilih user & database tadi → centang **ALL PRIVILEGES**.

Catat nama database, user, dan password lengkap (dengan awalan).

## 2. Unggah aplikasi

cPanel → **File Manager**

1. Di folder home (`/home/userCpanel/`), buat folder **`native-motor`**.
   **Jangan** di dalam `public_html` — supaya file `.env` tidak bisa diakses dari internet.
2. Masuk ke folder itu → **Upload** `native-motor-deploy.zip` → klik kanan → **Extract**.
3. Salin `.env.example` menjadi **`.env`**, lalu **Edit**:

```ini
DB_HOST=localhost
DB_PORT=3306
DB_USER=userCpanel_kasir
DB_PASSWORD=password-database-tadi
DB_NAME=userCpanel_kasir

OWNER_PASSWORD=ganti-dengan-password-login-yang-kuat
AUTH_SECRET=isi-64-karakter-acak

GEMINI_API_KEY=api-key-gemini-anda
VISION_ENABLED=false

STORE_TZ_OFFSET=+07:00
STORE_TZ=Asia/Jakarta
```

`AUTH_SECRET` bisa dibuat di komputer sendiri dengan:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 3. Buat aplikasi Node.js

cPanel → **Setup Node.js App** → **Create Application**

| Isian | Nilai |
|---|---|
| Node.js version | versi terbaru yang tersedia (minimal **18**, disarankan 20/22) |
| Application mode | **Production** |
| Application root | `native-motor` |
| Application URL | domain / subdomain, mis. `kasir.tokoanda.com` |
| Application startup file | **`app.cjs`** |

Klik **Create**, lalu:

1. Klik **Run NPM Install** (tunggu sampai selesai).
2. Klik **Restart**.
3. Buka alamat aplikasi → halaman login muncul. Tabel database dibuat otomatis saat pertama jalan
   (database kosong, siap diisi data toko asli).

> Ingin mencoba dengan data contoh dulu? Di halaman aplikasi Node.js, bagian **Run JS script**, jalankan
> `db:seed`. Untuk mengosongkan lagi: `db:wipe`.

## 4. HTTPS (wajib untuk install di HP & kamera)

1. cPanel → **SSL/TLS Status** → pastikan domain/subdomain sudah dapat sertifikat (AutoSSL), atau klik *Run AutoSSL*.
2. cPanel → **Domains** → aktifkan **Force HTTPS Redirect** untuk domain aplikasi.

## 5. Cek setelah online

- [ ] Login dengan `OWNER_PASSWORD`.
- [ ] **Pengaturan**: isi profil toko, lebar kertas struk, **unggah QRIS & isi rekening**.
- [ ] Pengaturan → Status Cari Pakai Foto: Gemini **Aktif**, kemiripan foto **Dimatikan** (normal untuk shared hosting).
- [ ] Import produk (Katalog → Import CSV) atau tambah manual.
- [ ] Coba 1 transaksi kasir → cetak struk → void transaksi itu.
- [ ] Di HP (Chrome): buka alamat aplikasi → menu ⋮ → **Install app / Tambahkan ke layar utama**.

## 6. Update versi baru

1. Di komputer: `npm run package`.
2. File Manager: unggah zip baru ke `native-motor/` → Extract → **timpa** file lama.
   File `.env` dan folder `uploads/` tidak ada di zip, jadi aman.
3. Setup Node.js App → **Run NPM Install** (jika ada paket baru) → **Restart**.

Pengguna yang sudah membuka aplikasi akan mendapat versi baru otomatis saat memuat ulang halaman.

## 7. Backup rutin

- Aplikasi: **Pengaturan → Backup → Unduh Backup** (JSON semua data).
- Foto produk & QRIS: unduh folder **`native-motor/uploads/`** (klik kanan → Compress → Download).
- Database lengkap: cPanel → **phpMyAdmin** → pilih database → Export, atau gunakan menu **Backup** cPanel.

## 8. Jika ada masalah

| Gejala | Penyebab & solusi |
|---|---|
| Halaman error 503 / aplikasi tidak jalan | Buka file `native-motor/stderr.log` (atau log di Setup Node.js App). Biasanya isian database di `.env` salah. Perbaiki lalu **Restart** |
| "OWNER_PASSWORD belum diisi" di log | `.env` belum dibuat / salah lokasi (harus di dalam folder `native-motor`) |
| `Access denied for user` di log | User belum ditambahkan ke database dengan ALL PRIVILEGES (langkah 1.3) |
| Run NPM Install gagal | Pilih versi Node.js lebih baru, lalu ulangi |
| Upload foto tetap jalan tapi foto tidak dikompres ulang | Paket `sharp` tidak bisa dipasang di server; aman, foto sudah dikompres di browser |
| Aplikasi lambat sesaat setelah lama tidak dipakai | Normal di shared hosting (aplikasi "tidur" lalu bangun kembali ±5 detik) |
| Lupa password login | Ganti `OWNER_PASSWORD` di `.env` lalu Restart — semua perangkat otomatis harus login ulang |

**Penting:** tombol "Reset ke Data Contoh" sengaja dimatikan di server produksi agar data toko tidak terhapus.
Pulihkan backup juga meminta password pemilik.
