# PRD — Aplikasi Manajemen Toko Sparepart Motor

> Nama toko & aplikasi: **Native Motor**
> Versi dokumen: 1.1 (final) · 17 Oktober 2026 · Desain: `DESIGN.md` v3
> Pemilik produk: KyRa

---

## 1. Ringkasan

Web app responsif (bisa di-install sebagai PWA di HP) untuk mengelola toko sparepart motor yang dijalankan sendiri oleh pemilik. Fokus utama: **stok selalu akurat**, **kasir cepat**, dan **pembelian ke supplier tercatat rapi** — sehingga pemilik tahu barang apa yang harus dibeli, berapa modal yang tertahan, dan berapa untung sebenarnya.

## 2. Latar Belakang & Masalah

Toko sparepart punya karakter yang beda dari toko retail biasa:

| Masalah | Dampak |
|---|---|
| Ratusan–ribuan SKU kecil dengan nama mirip (kampas rem, bearing, busi berbagai tipe) | Susah dicari, salah ambil barang |
| Satu part cocok untuk beberapa motor, dan pelanggan biasanya bertanya "ada buat Beat 2018?" | Pemilik harus hafal kompatibilitas |
| Harga beli dari supplier sering berubah | Margin tidak jelas kalau HPP tidak dihitung |
| Stok habis baru ketahuan saat pembeli datang | Kehilangan penjualan |
| Barang tidak laku menumpuk (dead stock) | Modal tertahan |
| Beli ke supplier sering tempo/hutang | Lupa jatuh tempo |

## 3. Tujuan

1. Stok di aplikasi sama dengan stok fisik (selisih saat stock opname < 2%).
2. Transaksi kasir selesai < 30 detik untuk 1–3 item.
3. Pemilik dapat peringatan sebelum barang habis.
4. Laba kotor per hari/bulan bisa dilihat tanpa hitung manual.
5. Tidak ada hutang supplier yang terlewat jatuh tempo.

## 4. Pengguna

**Satu pengguna: Pemilik (owner)** — berperan sebagai kasir, admin gudang, dan pembeli ke supplier sekaligus.

- Pakai laptop di meja kasir, dan HP saat cek gudang / di luar toko.
- Paham motor dan part, tidak harus paham akuntansi.
- Butuh input cepat, tampilan jelas, angka langsung terbaca.

> Multi-user dan multi-cabang **tidak** masuk versi ini, tapi struktur data disiapkan agar bisa ditambah nanti (lihat §11).

## 5. Lingkup

### Masuk (v1)
- Master produk + kompatibilitas motor
- Monitoring & mutasi stok (kartu stok)
- Kasir (POS) + struk
- Pembelian, penerimaan barang, supplier, hutang
- Retur (penjualan & pembelian)
- Stock opname
- Dashboard & laporan
- Pengaturan toko, backup data

### Tidak masuk (v1)
- Jualan online / katalog publik / integrasi marketplace
- Layanan bengkel/servis
- Multi-user, hak akses, multi-cabang
- Akuntansi lengkap (neraca, jurnal), pajak/e-Faktur
- Program member/poin

---

## 6. Fitur & Kebutuhan Fungsional

Prioritas: **P0** = wajib rilis, **P1** = penting tapi bisa menyusul, **P2** = nanti.

### 6.1 Master Produk (P0)

| ID | Kebutuhan | Prio |
|---|---|---|
| PRD-01 | Tambah/ubah/arsipkan produk: nama, SKU internal, nomor part (part number OEM), merek part, kategori, satuan (pcs/set/pasang/liter/botol), lokasi rak | P0 |
| PRD-02 | Jenis part: **Original (OEM)**, **KW/Aftermarket**, **Copotan/Bekas** | P0 |
| PRD-03 | Harga jual ecer; opsional harga kedua (mis. harga bengkel/langganan) | P0 |
| PRD-04 | HPP dihitung otomatis dengan **rata-rata tertimbang** (moving average) dari setiap pembelian | P0 |
| PRD-05 | Stok minimum per produk (batas peringatan) | P0 |
| PRD-06 | **Kompatibilitas motor**: satu produk bisa ditandai cocok untuk banyak motor (merek → model → rentang tahun), mis. Honda Beat FI 2016–2020 | P0 |
| PRD-07 | Barcode: pakai barcode pabrik atau generate barcode internal; cetak label barcode (ukuran label 33×15 mm / 50×25 mm) | P1 |
| PRD-08 | Foto produk 1–5 per produk (lihat §6.10) | P0 |
| PRD-09 | Import produk massal dari Excel/CSV + template | P1 |
| PRD-10 | Produk pengganti/substitusi (mis. part KW pengganti part original) | P2 |

**Pencarian produk** (dipakai di seluruh aplikasi):
- Cari berdasarkan nama, SKU, part number, barcode, merek part.
- Filter berdasarkan **motor** ("tampilkan semua part untuk Vario 125 2019"), kategori, jenis, status stok.
- Toleran salah ketik & sinonim umum (mis. "kampas" = "brake pad", "aki" = "accu").

### 6.2 Stok & Monitoring (P0)

| ID | Kebutuhan | Prio |
|---|---|---|
| STK-01 | Stok berubah **hanya** lewat transaksi (penjualan, pembelian, retur, opname, penyesuaian) — tidak bisa diedit langsung | P0 |
| STK-02 | **Kartu stok** per produk: riwayat masuk/keluar, saldo berjalan, referensi transaksi | P0 |
| STK-03 | Status stok: **Aman**, **Menipis** (≤ stok minimum), **Habis** (0) | P0 |
| STK-04 | Daftar "Perlu Dibeli": produk Menipis/Habis + saran jumlah beli (berdasarkan rata-rata penjualan 30 hari) | P0 |
| STK-05 | Penyesuaian stok manual dengan alasan wajib (rusak, hilang, pemakaian sendiri, koreksi) | P0 |
| STK-06 | Nilai persediaan total (stok × HPP) | P0 |
| STK-07 | Analisis pergerakan: **Fast moving**, **Slow moving**, **Dead stock** (tidak terjual > 90 hari, ambang bisa diatur) | P1 |
| STK-08 | Notifikasi push (PWA) saat ada produk masuk status Menipis/Habis | P1 |

### 6.3 Kasir / POS (P0)

| ID | Kebutuhan | Prio |
|---|---|---|
| POS-01 | Tambah item lewat scan barcode, ketik cari, atau pilih dari filter motor | P0 |
| POS-02 | Ubah jumlah, harga (pilih harga ecer/harga kedua), diskon per item (Rp atau %) dan diskon total | P0 |
| POS-03 | Peringatan jika jual di bawah HPP | P0 |
| POS-04 | Peringatan jika stok tidak cukup; tetap bisa lanjut dengan konfirmasi (stok minus ditandai untuk dicek) | P0 |
| POS-05 | Metode bayar: Tunai (hitung kembalian + tombol nominal cepat), QRIS, Transfer; bisa split | P0 |
| POS-06 | Struk: cetak thermal 58/80 mm via browser, atau kirim struk ke WhatsApp (link/teks) | P0 |
| POS-07 | Simpan transaksi sementara (hold) untuk melayani pembeli lain | P1 |
| POS-08 | Catatan transaksi: nama pembeli & plat/tipe motor (opsional) | P1 |
| POS-09 | Batalkan transaksi (void) di hari yang sama dengan alasan; stok kembali otomatis | P0 |
| POS-10 | Retur penjualan: pilih transaksi asal, item & jumlah, kembalikan ke stok atau tandai rusak | P0 |
| POS-11 | Penjualan tempo/piutang pelanggan | P2 |
| POS-12 | Pintasan keyboard penuh (`/` cari, F8 bayar, Esc batal, dll.) | P0 |
| POS-13 | **Mode Kasir (Fokus)** di dalam web admin yang sama (`/kasir`): tanpa sidebar & notifikasi, hanya cari–keranjang–total; masuk lewat menu/F1, keluar lewat tombol Selesai | P0 |
| POS-14 | Di mode kasir, HPP, margin, dan stok minimum tidak ditampilkan (layar bisa terlihat pembeli) | P0 |

### 6.4 Pembelian & Supplier (P0)

| ID | Kebutuhan | Prio |
|---|---|---|
| BLI-01 | Master supplier: nama, kontak/WA, alamat, termin default (hari), catatan | P0 |
| BLI-02 | **Purchase Order (PO)**: buat dari daftar "Perlu Dibeli" atau manual; kirim ke supplier via WhatsApp/PDF | P1 |
| BLI-03 | **Penerimaan barang**: dari PO atau langsung (tanpa PO); bisa diterima sebagian | P0 |
| BLI-04 | Input harga beli aktual per item → update HPP rata-rata; tampilkan perubahan dari harga beli terakhir (naik/turun) | P0 |
| BLI-05 | Opsi update harga jual saat harga beli berubah (dengan saran margin) | P1 |
| BLI-06 | Pembayaran: Lunas atau Tempo (jatuh tempo otomatis dari termin) | P0 |
| BLI-07 | **Hutang supplier**: daftar per supplier, sisa hutang, jatuh tempo, pembayaran cicilan | P0 |
| BLI-08 | Pengingat hutang jatuh tempo (H-3, hari H, lewat) di dashboard + notifikasi | P0 |
| BLI-09 | Foto/lampiran nota supplier | P1 |
| BLI-10 | Retur pembelian ke supplier (potong hutang atau refund) | P1 |
| BLI-11 | Riwayat harga beli per produk per supplier (untuk bandingkan supplier termurah) | P1 |

### 6.5 Stock Opname (P0)

| ID | Kebutuhan | Prio |
|---|---|---|
| OPN-01 | Mulai sesi opname: semua produk, per kategori, atau per rak | P0 |
| OPN-02 | Input stok fisik (bisa pakai HP + scan barcode sambil jalan di gudang) | P0 |
| OPN-03 | Tampilkan selisih (sistem vs fisik) dan nilai rupiahnya | P0 |
| OPN-04 | Finalisasi → stok disesuaikan otomatis, tercatat di kartu stok | P0 |

### 6.6 Dashboard (P0)

Ditampilkan saat aplikasi dibuka:
- Penjualan hari ini (omzet, jumlah transaksi, laba kotor)
- Grafik penjualan 7/30 hari
- Jumlah produk Menipis & Habis → tautan ke "Perlu Dibeli"
- Hutang jatuh tempo minggu ini
- 5 produk terlaris (minggu ini)
- Nilai persediaan

### 6.7 Laporan (P0/P1)

| Laporan | Isi | Prio |
|---|---|---|
| Penjualan | Per periode, per produk, per kategori, per metode bayar | P0 |
| Laba kotor | Omzet − HPP terjual − diskon, per periode & per produk | P0 |
| Persediaan | Stok & nilai per produk/kategori | P0 |
| Pembelian | Per periode, per supplier | P0 |
| Hutang | Umur hutang per supplier | P0 |
| Pergerakan barang | Fast/slow/dead stock | P1 |
| Arus kas sederhana | Kas masuk (penjualan) & kas keluar (bayar supplier, biaya operasional) | P1 |

Semua laporan bisa di-export ke **Excel** dan **PDF**.

### 6.8 Biaya Operasional (P1)
Catat pengeluaran (sewa, listrik, gaji, plastik, dll.) agar bisa melihat **laba bersih sederhana**.

### 6.9 Pengaturan (P0)
- Profil toko (nama, alamat, no. WA, logo) → muncul di struk & PO
- Format struk & ukuran kertas printer
- Ambang dead stock, kategori, satuan, daftar merek & model motor
- Keamanan: login email + password, **PIN 6 digit** untuk membuka kembali sesi
- **Backup**: export seluruh data (JSON/Excel) + backup otomatis harian di server

### 6.10 Foto Produk & Cari Pakai Foto (AI)

**Masalah:** pembeli sering tidak tahu nama part. Mereka datang membawa foto (dari HP atau dikirim lewat WhatsApp) atau part bekasnya, lalu pemilik harus menebak dan mencari manual.

**Cara kerja: dua jalur AI berjalan bersamaan**

1. **Kemiripan visual.** Setiap foto produk diubah menjadi *embedding* (vektor angka) oleh model visi. Foto dari pelanggan diubah dengan cara yang sama, lalu database mencari foto produk yang paling mirip. Cepat (< 1 detik), murah, dan makin akurat jika foto produk lengkap.
2. **Pembacaan AI.** Model AI multimodal "membaca" foto: jenis part, ciri fisik (cakram/tromol, jumlah pin, ukuran), merek, teks atau part number yang tercetak, dan perkiraan motor. Hasilnya dipakai sebagai kata kunci + filter di pencarian biasa. Jalur ini berguna saat foto produk belum lengkap atau part number terlihat di kemasan.
3. Hasil kedua jalur digabung → tampil **maksimal 5 kandidat** lengkap dengan tingkat kecocokan, foto, stok, harga, dan rak. **Pemilik yang memutuskan**; AI tidak pernah menambahkan barang ke pesanan sendiri.
4. **Belajar dari konfirmasi.** Saat pemilik memilih "Ini barangnya", foto pelanggan bisa disimpan sebagai foto referensi tambahan untuk produk itu, sehingga pencarian berikutnya makin akurat.

| ID | Kebutuhan | Prio |
|---|---|---|
| FOT-01 | Foto produk 1–5 per produk; foto utama tampil di daftar produk, kasir, dan detail. Upload dari kamera HP atau file; dikompres otomatis (sisi terpanjang ±1600 px, WebP) | P0 |
| FOT-02 | Thumbnail di hasil pencarian kasir & daftar produk; produk tanpa foto diberi placeholder dan penanda "belum ada foto" di admin | P0 |
| FOT-03 | Mode **Lengkapi foto**: daftar produk tanpa foto, foto beruntun pakai kamera HP sambil keliling rak | P1 |
| AI-01 | Tombol **Cari pakai foto** di kasir & pencarian global. Sumber: kamera, galeri/file, drag-and-drop, atau **tempel (Ctrl+V)** gambar dari WhatsApp Web. Bisa crop sebelum dicari | P0 |
| AI-02 | Pencarian kemiripan visual (embedding + pgvector) terhadap semua foto produk | P0 |
| AI-03 | Pembacaan AI: jenis part, ciri, teks/part number terbaca, perkiraan motor. Ditampilkan sebagai "AI membaca: …" dan bisa diedit lalu dicari ulang | P0 |
| AI-04 | Hasil maks. 5 kandidat dengan label **Sangat mirip / Mirip / Mungkin**, stok & rak; aksi: Tambah ke pesanan, Lihat detail, Bukan ini | P0 |
| AI-05 | Jika tidak ada yang cocok/stok habis: tampilkan deskripsi AI + tombol **Catat permintaan** (masuk daftar Perlu Dibeli sebagai "dicari pelanggan") | P1 |
| AI-06 | Konfirmasi "Ini barangnya" menyimpan foto sebagai referensi (bisa dimatikan di pengaturan) | P1 |
| AI-07 | Log pencarian foto (foto, hasil, pilihan pemilik) untuk mengukur akurasi | P1 |
| AI-08 | Embedding dibuat otomatis di latar belakang setiap kali foto produk ditambah/diubah | P0 |
| AI-09 | Kuota panggilan AI per hari bisa diatur; jika habis, hanya jalur kemiripan visual yang berjalan | P1 |
| AI-10 | Saat offline: tombol dinonaktifkan dengan pesan jelas; pencarian teks tetap berjalan | P0 |

**Target:** hasil tampil < 3 detik; barang yang benar ada di 5 kandidat teratas pada ≥ 80% pencarian, setelah ≥ 70% produk fast moving punya foto.

**Privasi:** foto pelanggan disimpan maksimal 30 hari kecuali dijadikan referensi produk.

---

## 7. Alur Utama

**A. Menjual**
`Kasir → scan/cari "kampas rem beat" → pilih → (jumlah) → Bayar → Tunai 50.000 → kembalian tampil → Cetak/WA struk → stok berkurang`

**B. Restock**
`Dashboard: "12 produk menipis" → Perlu Dibeli → centang item → Buat PO → kirim WA ke supplier → barang datang → Terima barang → cek jumlah & harga → Tempo 30 hari → stok & HPP terupdate, hutang tercatat`

**C. Pelanggan tanya part**
`Cari → filter Motor: Honda Vario 125 / 2019 → kategori Rem → lihat stok & harga → tambah ke kasir`

**D. Pelanggan cuma punya foto**
`Pelanggan kirim foto lewat WA → di kasir klik Cari pakai foto (atau Ctrl+V) → AI membaca: "kampas rem cakram depan, teks 06455-K44" → 5 kandidat + stok → pilih "Ini barangnya" → Tambah ke pesanan`

---

## 8. Kebutuhan Non-Fungsional

| Aspek | Target |
|---|---|
| Kecepatan | Pencarian produk < 300 ms untuk 10.000 SKU; halaman utama siap < 2 dtk di 4G |
| Responsif | Desktop (≥1280 px) untuk kasir & laporan; HP (≥360 px) untuk cek stok, opname, terima barang |
| Offline | Kasir tetap bisa transaksi saat internet putus; data tersinkron saat online (P1) |
| Integritas data | Semua mutasi stok di dalam transaksi database; tidak ada stok berubah tanpa jejak |
| Keamanan | HTTPS, password ter-hash, sesi kadaluarsa, row-level security per toko |
| Backup | Harian otomatis, retensi 30 hari; export manual kapan saja |
| Format lokal | Rupiah (Rp 1.250.000), tanggal `17 Okt 2026`, zona waktu WIB, Bahasa Indonesia |
| Hardware | Barcode scanner USB (mode keyboard), printer thermal 58/80 mm, kamera HP sebagai scanner |

## 9. Rekomendasi Teknologi

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind CSS** | Satu kodebase untuk desktop & HP, mudah jadi PWA |
| Komponen UI | shadcn/ui (dikustom sesuai design.md) | Cepat, bisa diubah total tampilannya |
| Backend & DB | **Supabase** (PostgreSQL + Auth + Storage) | Transaksi SQL kuat untuk stok, auth siap pakai, gratis untuk skala awal |
| Offline | IndexedDB (Dexie) + antrean sinkron | Kasir tetap jalan saat offline |
| Pencarian | PostgreSQL full-text + `pg_trgm` (toleran typo) | Tidak perlu layanan tambahan |
| Grafik | Recharts | Ringan |
| Export | SheetJS (Excel), react-pdf (PDF) | — |
| Scan kamera | `@zxing/browser` | Barcode via kamera HP |
| Deploy | Vercel + Supabase | Murah/gratis di awal |
| Foto | Supabase Storage + kompres di browser sebelum upload | Hemat kuota & cepat |
| AI pembaca foto | **Gemini Flash-Lite (free tier)** via Gemini API, output JSON terstruktur; Gemini Flash sebagai cadangan | Gratis untuk volume toko kecil, multimodal (gambar + teks), bisa membaca part number |
| AI kemiripan visual | **`gemini-embedding-2`** (embedding multimodal, dimensi 768) jika tersedia di free tier akun; jika tidak, model open-source **CLIP/SigLIP** dijalankan sendiri | Tanpa biaya per pemakaian |
| Penanganan kuota | Tangkap error 429 → tampilkan hasil kemiripan visual/teks saja + pesan "AI sedang penuh, coba lagi"; hitung pemakaian harian di database | Kuota free tier bisa berubah sewaktu-waktu |
| Privasi AI | Data free tier boleh dipakai Google untuk meningkatkan produk → wajib crop foto (tanpa wajah/plat nomor); pindah ke tier berbayar jika perlu | — |
| Vektor | **pgvector** di Supabase | Satu database dengan data produk, tidak perlu layanan tambahan |
| Keamanan AI | Panggilan AI hanya dari server (Edge Function / route handler); kunci API tidak pernah ke browser | — |

Alternatif jika lebih nyaman: **Laravel + Livewire + MySQL** di hosting biasa.

## 10. Model Data (ringkas)

```
stores            id, name, address, phone, logo_url, settings(json)
categories        id, store_id, name, parent_id
vehicle_brands    id, name                      -- Honda, Yamaha, Suzuki, Kawasaki
vehicle_models    id, brand_id, name            -- Beat FI, Vario 125, NMAX
products          id, store_id, sku, part_number, barcode, name, brand,
                  category_id, part_type(oem|aftermarket|used), unit,
                  sell_price, sell_price_2, avg_cost, stock_qty,
                  min_stock, rack_location, is_active, created_at
product_fitments  id, product_id, model_id, year_from, year_to
product_photos    id, product_id, url, is_primary,
                  source(owner|customer_confirmed),
                  embedding vector(768), created_at
photo_searches    id, image_url, ai_reading(json), candidates(json),
                  chosen_product_id?, expires_at, created_at
customer_requests id, description, photo_url?, status(open|ordered|done),
                  created_at                        -- barang dicari pelanggan

stock_movements   id, product_id, type(sale|purchase|sale_return|
                  purchase_return|adjustment|opname|void),
                  qty_change, cost_at_time, balance_after,
                  ref_table, ref_id, note, created_at

sales             id, store_id, number, customer_name, vehicle_note,
                  subtotal, discount, total, cost_total, status(paid|void),
                  created_at
sale_items        id, sale_id, product_id, qty, price, discount, cost
sale_payments     id, sale_id, method(cash|qris|transfer), amount
sale_returns      id, sale_id, ... / sale_return_items

suppliers         id, store_id, name, phone, address, default_term_days
purchase_orders   id, supplier_id, number, status(draft|sent|partial|done)
po_items          id, po_id, product_id, qty, est_price
purchases         id, supplier_id, po_id?, number, invoice_no, total,
                  payment_status(paid|credit|partial), due_date, attachment_url
purchase_items    id, purchase_id, product_id, qty, cost
supplier_payments id, purchase_id, amount, method, paid_at

opname_sessions   id, scope, status(open|final), started_at, finalized_at
opname_items      id, session_id, product_id, system_qty, counted_qty

expenses          id, store_id, category, amount, note, date
```

Aturan penting:
- `stock_qty` dan `avg_cost` di `products` diperbarui **hanya** oleh fungsi database (RPC) yang sekaligus menulis `stock_movements`.
- HPP rata-rata: `avg_baru = (stok_lama × avg_lama + qty_masuk × harga_beli) / (stok_lama + qty_masuk)`.
- Laba kotor memakai `cost` yang dibekukan di `sale_items` saat transaksi, bukan HPP terkini.
- Nomor dokumen berformat `INV-2610-0001`, `PB-2610-0001`, `PO-2610-0001`.

## 11. Pengembangan Berikutnya (setelah v1)

- Multi-user (kasir/staf) + hak akses + log aktivitas
- Layanan bengkel (jasa + pemakaian part)
- Katalog online & pesan lewat WhatsApp
- Penjualan tempo / piutang pelanggan
- Multi-cabang & transfer stok

## 12. Rencana Rilis

| Fase | Isi | Estimasi |
|---|---|---|
| **1 — Fondasi** | Auth, pengaturan toko, master produk + kompatibilitas + **foto produk**, import CSV, kartu stok, penyesuaian stok | 2 minggu |
| **2 — Kasir** | POS, pembayaran, struk thermal & WA, void, retur penjualan | 2 minggu |
| **3 — Pembelian** | Supplier, penerimaan barang, HPP rata-rata, hutang & pengingat | 1,5 minggu |
| **4 — Monitoring** | Dashboard, Perlu Dibeli, stock opname, laporan + export | 1,5 minggu |
| **4b — Cari pakai foto (AI)** | Embedding + pgvector, pembacaan AI, layar kandidat di kasir, catat permintaan, log akurasi, kuota | 1,5–2 minggu |
| **5 — Polesan** | PWA + offline kasir, notifikasi, PO, label barcode, biaya operasional | 2 minggu |

**MVP siap dipakai di toko: akhir Fase 3 (~5–6 minggu).**

## 13. Ukuran Keberhasilan

- 100% transaksi toko tercatat di aplikasi setelah bulan pertama
- Selisih stock opname < 2% dari jumlah SKU
- Kejadian "barang habis saat pembeli datang" turun ≥ 50% dalam 3 bulan
- Nol hutang supplier terlambat bayar
- Waktu rata-rata transaksi kasir < 30 detik

## 14. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Input data awal ribuan produk terasa berat | Import Excel + template; mulai dari produk fast moving dulu |
| Data kompatibilitas motor tidak lengkap | Kompatibilitas opsional; isi bertahap saat produk dijual |
| Internet toko tidak stabil | Mode offline kasir (Fase 5); prioritaskan lebih awal jika perlu |
| Lupa mencatat barang keluar | Stock opname rutin per kategori tiap minggu |
| Kehilangan data | Backup harian otomatis + export manual |
| Foto produk belum lengkap → AI kurang akurat | Mulai dari produk fast moving; mode Lengkapi foto; belajar dari konfirmasi |
| Part sangat mirip tapi beda tipe (mis. kampas Beat vs Vario) | AI hanya memberi kandidat; tampilkan part number & kompatibilitas; pemilik yang konfirmasi |
| Biaya API AI membengkak | Jalur kemiripan visual (murah) jalan duluan; kuota harian untuk pembacaan AI |

## 15. Pertanyaan Terbuka

1. Perkiraan jumlah SKU awal? (memengaruhi strategi import)
2. Sudah punya barcode scanner & printer thermal? Ukuran kertas 58 atau 80 mm?
3. Perlu dua level harga (ecer & bengkel/langganan) atau cukup satu?
4. Nama toko & logo untuk struk?
5. Fokus merek motor tertentu atau semua merek?
6. Sudah ada foto produk, atau difoto sendiri saat input stok awal?
7. Apakah `gemini-embedding-2` tersedia di free tier akun AI Studio? (menentukan jalur kemiripan visual: Gemini atau CLIP/SigLIP)
