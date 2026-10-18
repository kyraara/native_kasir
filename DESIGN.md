# DESIGN.md — Native Motor

> Panduan desain visual & UI untuk web app toko sparepart **Native Motor** (admin + kasir dalam satu aplikasi).
> Pasangan dari `PRD.md` v1.1 · Versi 3.0 (final) · 17 Oktober 2026
> Mockup acuan: canvas "Native Motor — Mockup", halaman **Desain baru**.

---

## 1. Arah Desain: Modern Minimal, Panel Melayang

Tenang, rapi, dan cepat seperti alat kerja modern (acuan: Linear, Vercel, Supabase), dengan karakter yang lebih tegas:

- **Semua bagian adalah panel melayang**: kartu membulat di atas latar abu dingin, berjarak 12 px dari tepi layar dan satu sama lain.
- **Tiga warna saja:** putih (panel kerja), hitam pekat (panel penting: sidebar, keranjang, kartu hutang), dan **lime** sebagai satu-satunya aksen.
- **Angka besar** dengan font mono: total kasir, omzet, kembalian langsung terbaca dari jauh.

**Prinsip:**

1. **Satu aksen, dipakai hemat.** Lime hanya untuk aksi utama (Bayar, Selesaikan transaksi, Catat pembayaran), logo, angka kembalian, item menu aktif, dan badge "Perlu dibeli". Tidak pernah sebagai warna teks di atas putih.
2. **Hitam = fokus.** Panel hitam menandai hal yang sedang "dipegang": pesanan aktif, navigasi, uang keluar.
3. **Satu tugas per layar.** Satu tombol utama, sisanya sekunder atau ghost.
4. **Ruang daripada garis.** Pemisahan utama lewat jarak antarpanel; garis 1 px hanya di dalam panel.
5. **Gerak seperlunya.** Hover, buka/tutup panel, toast. Tanpa animasi halaman atau efek pantul.

**Dihindari:** gradien, glassmorphism, emoji, ilustrasi, ikon berwarna penuh, lebih dari satu aksen, teks lime di latar terang.

---

## 2. Dua Mode Tampilan (satu web)

| | **Admin** | **Kasir (Fokus)** — `/kasir` |
|---|---|---|
| Tujuan | Kelola produk, stok, pembelian, laporan | Melayani pembeli secepat mungkin |
| Kerangka | Sidebar hitam melayang + konten bento | Top bar putih + panel cari putih + panel pesanan hitam |
| Info sensitif | HPP, margin, laba tampil | **HPP & margin disembunyikan** |
| Notifikasi | Badge & kartu "Perlu perhatian" | Disembunyikan, kecuali peringatan stok item di pesanan |
| Masuk / keluar | — | Menu **Kasir** / `F1`; keluar via **Selesai** / `Ctrl+Esc` |

---

## 3. Warna

### 3.1 Token

| Token | Hex | Pemakaian |
|---|---|---|
| `--canvas` | `#ECEDEF` | Latar halaman (di bawah semua panel) |
| `--surface` | `#FFFFFF` | Panel kerja: top bar, panel cari, kartu dasbor |
| `--surface-2` | `#F4F4F5` | Isian di dalam panel putih: input, baris terpilih, chip, tile foto |
| `--line` | `#E4E4E7` | Border tipis di dalam panel putih |
| `--ink` | `#0E0E10` | Panel hitam: sidebar, pesanan, kartu hutang, AI membaca |
| `--ink-2` | `#1C1C1F` | Isian di dalam panel hitam: item pesanan, tombol, tombol keypad |
| `--ink-line` | `#2A2A2E` | Garis di dalam panel hitam |
| `--fg` | `#111113` | Teks utama di panel putih; tombol hitam |
| `--fg-2` | `#5B5B63` | Label, teks sekunder |
| `--fg-3` | `#6E6E76` | Keterangan kecil (lolos kontras 4.5:1 di putih) |
| `--on-ink` | `#F4F4F5` | Teks utama di panel hitam |
| `--on-ink-2` | `#A1A1AA` | Teks sekunder di panel hitam |
| `--accent` | `#D4FF3F` | Lime: aksi utama, logo, menu aktif, kembalian |
| `--on-accent` | `#111113` | Teks di atas lime (selalu gelap) |

### 3.2 Status

Ditampilkan sebagai **titik 7 px + teks**, bukan latar penuh.

| Status | Di putih | Di hitam | Contoh |
|---|---|---|---|
| Aman / Lunas | `#16A34A` | `#4ADE80` | `● Stok 14` |
| Menipis / Jatuh tempo dekat | `#D97706` | `#FBBF24` | `● Sisa 2` |
| Habis / Lewat tempo | `#DC2626` | `#F87171` | `● Habis` |

Kartu "Perlu perhatian" memakai kotak angka berlatar lembut: merah `#FEE2E2`/`#B91C1C`, kuning `#FEF3C7`/`#92400E`, netral `#E4E4E7`/`#3F3F46`.

### 3.3 Label kecocokan AI

| Label | Gaya |
|---|---|
| **Sangat mirip** | Latar `--ink`, teks lime; kartu kandidat diberi outline 2 px `--fg` |
| **Mirip** | Latar `#E4E4E7`, teks `#27272A` |
| **Mungkin** | Latar `--surface-2`, teks `--fg-2` |

### 3.4 Mode gelap
v1 cukup mode terang; panel hitam sudah memberi kontras. Mode gelap penuh masuk daftar P2 (balik `--canvas` ke `#09090B` dan panel putih ke `#151517`).

---

## 4. Tipografi

| Peran | Font |
|---|---|
| UI & teks | **Geist** 400 / 500 / 600 / 700 |
| Angka, harga, SKU, part number, pintasan | **Geist Mono** 400 / 500 / 600 |

| Token | Ukuran / line-height | Berat | Tracking | Pemakaian |
|---|---|---|---|---|
| `total` | 48 / 52 | 600 | −0.035em | Total pesanan kasir |
| `hero-num` | 46 / 50 | 500 mono | −0.04em | Omzet di beranda |
| `title` | 30 / 36 | 600 | −0.03em | Salam/judul halaman admin |
| `h1` | 22 / 28 | 600 | −0.02em | Judul panel ("3 kandidat di toko") |
| `search` | 22 / 28 | 500 | −0.01em | Teks di kolom cari kasir |
| `stat` | 26 / 30 | 500 mono | −0.03em | Angka kartu statistik |
| `h2` | 16 / 24 | 600 | −0.01em | Judul kartu |
| `item` | 16 / 22 | 500 | −0.01em | Nama produk di daftar |
| `body` | 14 / 20 | 400 | 0 | Teks umum |
| `label` | 13 / 18 | 500 | 0 | Label, tombol kecil |
| `caption` | 12 / 16 | 400 | 0 | Kode, rak, keterangan |
| `overline` | 11 / 14 | 500, UPPERCASE, +0.04em | — | Judul grup menu sidebar |

- Rupiah: `Rp 118.000`. Di daftar, "Rp" dihilangkan dan angka memakai mono.
- Angka selalu `tabular-nums`, rata kanan di kolom.

---

## 5. Bentuk, Ruang & Kedalaman

| Elemen | Radius |
|---|---|
| Panel besar (panel cari, pesanan, sidebar, kartu dasbor) | **22 px** |
| Top bar, kartu kandidat, tile foto pelanggan | 18 px |
| Input besar, tombol utama 56–60 px, item pesanan | 16 px |
| Tombol 40–44 px, logo, chip, ikon tombol | 12 px |
| Chip filter, tombol kecil | 10 px |
| Badge | 6–7 px |

- **Spasi:** kelipatan 4 → `4 · 6 · 8 · 12 · 14 · 16 · 20 · 24 · 28`. Jarak antarpanel & tepi layar selalu **12 px**. Padding panel 22–28 px.
- **Bayangan:**
  - Panel putih: `0 1px 2px rgba(17,17,19,.05)` (hampir datar).
  - Panel hitam: `0 24px 48px -24px rgba(17,17,19,.45)` (kesan melayang).
  - Dropdown/modal/toast: `0 8px 24px rgba(17,17,19,.12)`.
- **Fokus:** input aktif diberi outline dalam 2 px `--fg` (di putih) atau lime (di hitam). Fokus keyboard: ring 2 px lime + offset 2 px.
- **Target sentuh:** minimal 44 px di kasir dan HP.

### Breakpoint

| Lebar | Admin | Kasir |
|---|---|---|
| < 768 px (HP) | Sidebar → bottom nav hitam melayang | Satu kolom; pesanan jadi bar hitam melayang di bawah |
| 768–1279 px | Sidebar ikon saja (72 px) | Panel pesanan turun ke bawah panel cari |
| ≥ 1280 px | Sidebar penuh 232–248 px | Dua kolom: cari (fleksibel) + pesanan (380–440 px) |

---

## 6. Admin

### 6.1 Sidebar melayang (hitam)
- Lebar 232–248 px, tinggi penuh dikurangi 12 px atas-bawah, radius 22, latar `--ink`.
- Atas: logo **NM** (kotak lime 38 px, radius 12, teks hitam 700) + "Native Motor" / "Sparepart motor".
- Menu dengan ikon garis 18 px (Lucide, stroke 1.8), dikelompokkan dengan judul `overline`: **GUDANG** (Produk, Stok, Perlu dibeli, Stock opname), **PEMBELIAN** (Terima barang, Supplier, Hutang), **ANALISIS** (Laporan). Beranda & Kasir di paling atas.
- Item aktif: latar `#1F1F23`, teks putih, **ikon berwarna lime**.
- Info kanan item: jumlah produk (mono abu), badge lime "12" untuk Perlu dibeli, teks kuning "2 jatuh tempo" untuk Hutang.
- Bawah: kartu profil (avatar, "Pemilik", kota) + tombol pengaturan.

### 6.2 Beranda (bento)
1. **Header:** tanggal + salam (`title`); kanan: cari global (`Ctrl K`), tombol putih "Terima barang", tombol hitam "Buka kasir" dengan titik lime.
2. **Baris 1:** kartu **Omzet hari ini** lebar (angka `hero-num`, badge hitam "+12%" berteks lime, grafik area 30 hari: isian lime 55%, garis hitam 2 px, pilihan 7h/30h/90h) + kolom 3 kartu kecil: Laba kotor, Transaksi, Nilai stok.
3. **Baris 2:** **Perlu perhatian** (habis, menipis, dead stock) · **Terlaris minggu ini** (bar horizontal, teratas hitam, sisanya abu) · **Hutang supplier** (kartu hitam, total jatuh tempo 7 hari, daftar faktur, tombol lime "Catat pembayaran").

### 6.3 Halaman lain
Pola sama: judul `title` di atas, isi dalam panel putih radius 22. Tabel di dalam panel tanpa garis vertikal; baris 56 px dengan thumbnail foto 40 px; detail produk dibuka sebagai panel melayang dari kanan (480 px).

---

## 7. Kasir

### 7.1 Layar utama
- **Top bar putih** (60 px, radius 18): logo + "Native Motor / Mode kasir"; kanan: tanggal-jam (mono, latar `--surface-2`) dan tombol hitam **Selesai**.
- **Panel cari putih:**
  - Kolom cari 64 px, latar `--surface-2`, outline 2 px hitam saat fokus, teks 22 px.
  - Di dalamnya tombol hitam **Cari pakai foto** (ikon kamera + titik lime).
  - Chip filter motor di bawahnya (terpilih: hitam).
  - Baris hasil: **foto produk 56 px** · nama + "OEM · kode · Rak" · status stok · harga mono 17 px · tombol hitam "+" 40 px. Hasil terpilih (keyboard) berlatar `--surface-2`.
- **Panel pesanan hitam** (380–440 px): "Pesanan" + nomor invoice, menu `⋯` (tahan, diskon total, catatan); item dalam kartu `--ink-2` dengan stepper qty; peringatan stok kuning; subtotal/diskon; **Total 48 px**; tombol lime **Bayar** 60 px dengan kbd `F8`.

### 7.2 Bayar
- Panel kiri berubah jadi **Ringkasan pesanan** + kartu opsional (pembeli, motor pembeli, struk).
- Panel hitam: total, segmen metode (Tunai/QRIS/Transfer; terpilih putih), input uang diterima (outline lime), tombol nominal cepat, **keypad 3×4** untuk layar sentuh, **Kembalian** berwarna lime, tombol lime **Selesaikan transaksi** (`Enter`).

### 7.3 Cari pakai foto (AI)
- Dibuka dari tombol kamera, `Ctrl+V` (tempel dari WhatsApp Web), atau drag-and-drop ke panel cari.
- **Kiri:** foto pelanggan (4:3, radius 18) + sumber & waktu + tombol **Crop** / **Ganti foto**; di bawahnya kartu hitam **AI membaca foto** berisi Jenis part, Ciri, **Teks terbaca** (part number dalam badge lime), Perkiraan motor, dan tombol "Ubah kata kunci & cari ulang".
- **Kanan:** "N kandidat di toko" + waktu proses; kartu kandidat (foto 72 px, label kecocokan + alasan singkat, nama, jenis · kode · rak · motor, harga, stok); aksi **Bukan ini** (ghost) dan **Ini barangnya · Tambah** (hitam untuk kandidat teratas).
- Bawah: kotak garis putus-putus "Tidak ada yang cocok?" + **Catat permintaan**.
- **Saat memproses:** skeleton kartu + teks "AI sedang membaca foto…" (maks. 3 detik). **Kuota habis:** banner abu "Pembacaan AI sedang penuh — menampilkan hasil kemiripan foto saja".

### 7.4 Kasir di HP
Header logo + tombol tutup; kolom cari putih + **tombol scan/kamera hitam 52 px**; chip motor; kartu hasil putih radius 18 dengan tombol "+" (lime jika sudah ada di pesanan); **bar pesanan hitam melayang** di bawah (12 px dari tepi): jumlah item, total, tombol lime **Bayar**.

### 7.5 Pintasan

| Tombol | Aksi |
|---|---|
| `F1` | Masuk mode kasir |
| `/` | Fokus ke pencarian |
| `Ctrl+V` | Cari pakai foto dari clipboard |
| `↑ ↓` · `Enter` | Pilih & tambah hasil |
| `F8` | Bayar |
| `Enter` (di Bayar) | Selesaikan transaksi |
| `Esc` | Kembali / batal |
| `Ctrl+Esc` | Keluar mode kasir |

---

## 8. Foto Produk

- Rasio **1:1** untuk thumbnail (dipotong tengah), 4:3 untuk foto pelanggan.
- Ukuran tampil: 40 px (tabel admin), 56 px (kasir), 72 px (kandidat AI), 100% (detail).
- Placeholder tanpa foto: kotak `--surface-2`, border `--line`, ikon gambar abu 20 px. Di admin diberi titik kuning "belum ada foto".
- Panduan memotret (ditampilkan di mode **Lengkapi foto**): latar polos terang, part di tengah, part number menghadap kamera, tanpa bayangan keras.

## 9. Komponen Ringkas

| Komponen | Spesifikasi |
|---|---|
| Tombol utama (aksen) | Lime, teks hitam 600, tinggi 56–60 px, radius 16, kbd mono di kanan |
| Tombol utama (netral) | Hitam `--fg`, teks putih, 40–44 px, radius 12–14 |
| Tombol sekunder | Putih/`--surface-2`, teks `--fg`, radius 12 |
| Tombol ghost | Transparan, teks `--fg-2` |
| Chip | 34–36 px, radius 10; terpilih hitam, lainnya putih + border |
| Segmented | Wadah `--surface-2`/`--ink-2` padding 3–4 px, item terpilih putih atau hitam |
| Input | 52–64 px, latar `--surface-2`, tanpa border; fokus outline dalam 2 px |
| Kartu | Putih/hitam, radius 22, padding 22–24 |
| Toast | Hitam, teks putih, radius 14, kanan bawah; aksi "Urungkan" berwarna lime |
| Ikon | Lucide (garis), 16–20 px, stroke 1.8–2 |

## 10. Gerak

- 150 ms, `cubic-bezier(.2,0,0,1)`.
- Item masuk pesanan: kilasan latar `#2A2A2E` 300 ms di panel hitam.
- Panel Bayar: isi panel hitam berganti dengan fade 150 ms (tanpa geser).
- `prefers-reduced-motion` → instan.

## 11. Aksesibilitas

- Lime hanya sebagai latar dengan teks hitam, atau teks/ikon di atas panel hitam (kontras tinggi). Tidak pernah teks lime di atas putih.
- Teks keterangan minimal `#6E6E76` di putih dan `#A1A1AA` di hitam.
- Status selalu titik + teks.
- Semua tombol berupa `<button>`/`<a>` asli; tombol ikon punya `aria-label`.
- Semua alur kasir bisa dijalankan dengan keyboard.

## 12. Struk Thermal (58 mm)

```
           NATIVE MOTOR
     Sparepart Motor · Palembang
          WA 0812-xxxx-xxxx
--------------------------------
INV-2610-0042     17/10/26 21:30
--------------------------------
Kampas Rem Depan Beat FI
  2 x 45.000            90.000
Busi NGK CPR8EA-9
  1 x 28.000            28.000
--------------------------------
TOTAL                  118.000
Tunai                  150.000
Kembali                 32.000
--------------------------------
  Penukaran maks. 3 hari dengan
      struk & kemasan utuh
          Terima kasih
```

## 13. Token CSS

```css
:root {
  --canvas:#ECEDEF; --surface:#FFFFFF; --surface-2:#F4F4F5; --line:#E4E4E7;
  --ink:#0E0E10; --ink-2:#1C1C1F; --ink-line:#2A2A2E;
  --fg:#111113; --fg-2:#5B5B63; --fg-3:#6E6E76;
  --on-ink:#F4F4F5; --on-ink-2:#A1A1AA;
  --accent:#D4FF3F; --on-accent:#111113;
  --ok:#16A34A; --warn:#D97706; --danger:#DC2626;
  --ok-ink:#4ADE80; --warn-ink:#FBBF24; --danger-ink:#F87171;

  --font-sans:"Geist",system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-mono:"Geist Mono",ui-monospace,"SF Mono",monospace;

  --r-xs:6px; --r-sm:10px; --r-md:12px; --r-lg:16px; --r-xl:18px; --r-panel:22px;
  --gap-panel:12px;
  --shadow-panel:0 1px 2px rgba(17,17,19,.05);
  --shadow-ink:0 24px 48px -24px rgba(17,17,19,.45);
  --shadow-float:0 8px 24px rgba(17,17,19,.12);
  --ease:cubic-bezier(.2,0,0,1); --dur:150ms;
}

body { margin:0; background:var(--canvas); color:var(--fg); font:400 14px/20px var(--font-sans); }
.num { font-family:var(--font-mono); font-variant-numeric:tabular-nums; }
.panel { background:var(--surface); border-radius:var(--r-panel); box-shadow:var(--shadow-panel); }
.panel-ink { background:var(--ink); color:var(--on-ink); border-radius:var(--r-panel); box-shadow:var(--shadow-ink); }
```

**Tailwind + shadcn/ui:** petakan token ke `theme.extend` (`colors.canvas`, `colors.ink`, `colors.accent`, `borderRadius.panel`, dst.), lalu set variabel shadcn: `--background` = canvas, `--card` = surface, `--primary` = fg, `--accent` = lime, `--ring` = lime, `--radius` = 12px.
