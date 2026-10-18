# Native Motor — Kasir & Manajemen Toko Sparepart Motor

Web app (bisa di-install di HP sebagai PWA) untuk kasir, stok, pembelian ke supplier, retur, stock opname,
laporan (PDF/Excel), label barcode, dan **cari sparepart pakai foto**.

- Frontend: React + Vite + Tailwind
- Backend: Express (TypeScript, dijalankan dengan `tsx`)
- Database: MySQL 8
- AI: kemiripan foto CLIP (lokal di server, gratis) + Gemini (opsional, untuk membaca part number dari foto)

---

## 1. Kebutuhan

| | |
|---|---|
| Node.js | versi 20 atau lebih baru |
| MySQL | 8.x (Laragon sudah menyediakan) |
| Internet | saat `npm install` dan saat pertama kali server jalan (unduh model foto ±90 MB, sekali saja) |

## 2. Instalasi (komputer toko / Laragon)

```bash
npm install --legacy-peer-deps
cp .env.example .env          # lalu isi .env (lihat bagian 3)
npm run db:migrate            # buat database & tabel
```

Pilih salah satu:

```bash
npm run db:seed    # isi dengan DATA CONTOH (untuk mencoba)
npm run db:wipe    # kosongkan semua data → siap pakai data toko asli
```

Nyalakan MySQL dulu (Laragon → **Start All**), lalu:

```bash
npm run dev        # mode pengembangan  → http://localhost:3000
```

## 3. Isi file `.env`

| Variabel | Keterangan |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Koneksi MySQL. Laragon bawaan: `root` tanpa password |
| `OWNER_PASSWORD` | **Password login pemilik — wajib diganti** |
| `AUTH_SECRET` | String acak panjang (min. 32 karakter). Jika kosong, semua perangkat harus login ulang tiap server restart |
| `GEMINI_API_KEY` | Opsional. Tanpa ini, cari pakai foto tetap jalan lewat kemiripan foto saja |
| `GEMINI_MODEL` | Opsional, model Gemini yang dipakai |
| `STORE_TZ_OFFSET` | Zona waktu toko untuk laporan harian, default `+07:00` (WIB) |
| `PORT` | Port server, default `3000` |

## 4. Menjalankan untuk dipakai sehari-hari (produksi)

```bash
npm run build      # buat versi produksi (folder dist/)
npm start          # jalankan server produksi
```

Agar server otomatis jalan saat komputer dinyalakan, gunakan misalnya [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start npm --name native-motor -- start
pm2 save
```

**Akses dari HP di jaringan WiFi toko:** buka `http://<IP-komputer-server>:3000` di Chrome HP.
Untuk bisa **di-install sebagai aplikasi (PWA)** dan memakai kamera HP, browser mewajibkan **HTTPS**
(kecuali di `localhost`). Pilihan termudah:

- Pasang di VPS/hosting Node.js dengan domain + HTTPS (mis. lewat Nginx + Let's Encrypt, atau Cloudflare), atau
- Pakai Cloudflare Tunnel / ngrok untuk memberi alamat HTTPS ke server di toko.

Contoh blok Nginx (reverse proxy):

```nginx
server {
  server_name kasir.tokoanda.com;
  client_max_body_size 20m;           # upload foto
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## 5. Backup

1. Menu **Pengaturan → Backup & Data → Unduh Backup** (file JSON berisi semua data).
2. **Salin juga folder `uploads/`** — berisi foto produk & QRIS (tidak ikut di file JSON).
3. Untuk backup penuh database bisa juga: `mysqldump -u root native_motor > backup.sql`.

## 6. Mode offline kasir

- Saat internet/server terputus, aplikasi memakai **salinan data terakhir** di perangkat dan kasir tetap bisa transaksi.
- Transaksi offline mendapat nomor sementara `OFF-…` dan dikirim otomatis saat koneksi kembali
  (tidak akan tercatat dobel walau terkirim ulang). Status tampil di banner bawah layar.
- Fitur lain (pembelian, retur, laporan, cari pakai foto) butuh koneksi ke server.
- Service worker PWA hanya aktif di mode produksi (`npm run build && npm start`).

## 7. Perintah lain

| Perintah | Fungsi |
|---|---|
| `npm test` | Tes otomatis (pencarian, CSV, harga, barcode, cari-foto) |
| `npm run lint` | Cek tipe TypeScript |
| `npm run icons` | Buat ulang favicon & ikon PWA dari `src/image/svg/ikon` |

## 8. Struktur singkat

```
server.ts            entry server (API + Vite dev / file produksi)
server/              API, transaksi stok (stock.ts), laporan, AI foto, upload
db/schema.sql        skema MySQL
src/                 aplikasi React (components/, utils/)
src/image/svg/       logo, ikon, maskot brand
public/              manifest PWA, service worker, ikon
uploads/             foto produk & QRIS (dibuat otomatis, jangan dihapus)
```
