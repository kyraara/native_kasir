/**
 * Import / export produk via CSV (PRD-09). Format sama untuk export & import,
 * jadi file hasil export bisa diedit di Excel lalu di-import kembali.
 */
import type { Product, PartType, MotorFitment } from '../types';

export interface CsvColumn {
  key: keyof ProductCsvRow;
  header: string;
  required?: boolean;
  hint: string;
}

export interface ProductCsvRow {
  sku: string;
  name: string;
  part_number: string;
  barcode: string;
  brand: string;
  category: string;
  part_type: string;
  unit: string;
  sell_price: string;
  sell_price_2: string;
  avg_cost: string;
  stock_qty: string;
  min_stock: string;
  rack_location: string;
  fitments: string;
}

export const CSV_COLUMNS: CsvColumn[] = [
  { key: 'sku', header: 'SKU', required: true, hint: 'Kode unik toko. Jika sudah ada → produk diperbarui' },
  { key: 'name', header: 'Nama Produk', required: true, hint: '' },
  { key: 'part_number', header: 'Part Number', hint: 'Nomor part OEM' },
  { key: 'barcode', header: 'Barcode', hint: '' },
  { key: 'brand', header: 'Merek', hint: '' },
  { key: 'category', header: 'Kategori', hint: '' },
  { key: 'part_type', header: 'Jenis', hint: 'Original / KW / Bekas' },
  { key: 'unit', header: 'Satuan', hint: 'pcs, set, pasang, liter, botol' },
  { key: 'sell_price', header: 'Harga Ecer', required: true, hint: '' },
  { key: 'sell_price_2', header: 'Harga Kedua', hint: 'Harga bengkel/langganan (opsional)' },
  { key: 'avg_cost', header: 'HPP Awal', hint: 'Hanya dipakai untuk produk baru' },
  { key: 'stock_qty', header: 'Stok Awal', hint: 'Hanya dipakai untuk produk baru' },
  { key: 'min_stock', header: 'Stok Min', hint: '' },
  { key: 'rack_location', header: 'Rak', hint: '' },
  { key: 'fitments', header: 'Kompatibilitas', hint: 'Pisahkan dengan ; atau , — mis. Honda Beat FI 2016-2020, Yamaha NMAX 155 2015-' },
];

// ---------- Parser CSV ----------

function detectDelimiter(firstLine: string): string {
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** Parser CSV sederhana: mendukung tanda kutip, "" di dalam kutip, dan baris baru di dalam kutip. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = detectDelimiter(src.split(/\r?\n/, 1)[0] || '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface ParsedImport {
  rows: ProductCsvRow[];
  missingColumns: string[];
}

export function parseProductCsv(text: string): ParsedImport {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], missingColumns: CSV_COLUMNS.filter((c) => c.required).map((c) => c.header) };

  const header = table[0].map(norm);
  const colIndex = new Map<string, number>();
  for (const col of CSV_COLUMNS) {
    const i = header.indexOf(norm(col.header));
    if (i >= 0) colIndex.set(col.key, i);
  }
  const missingColumns = CSV_COLUMNS.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);

  const rows = table.slice(1).map((r) => {
    const out = {} as ProductCsvRow;
    for (const col of CSV_COLUMNS) {
      const i = colIndex.get(col.key);
      out[col.key] = i === undefined ? '' : (r[i] ?? '').trim();
    }
    return out;
  });
  return { rows, missingColumns };
}

// ---------- Konversi nilai ----------

/** "Rp 45.000" → 45000; kosong → null */
export function parseNumber(s: string): number | null {
  const digits = (s || '').replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return null;
  return parseInt(digits, 10);
}

export function parsePartType(s: string): PartType | null {
  const v = norm(s);
  if (!v) return 'aftermarket';
  if (['oem', 'original', 'ori', 'asli', 'genuine'].includes(v)) return 'oem';
  if (['kw', 'aftermarket', 'am', 'replika'].includes(v)) return 'aftermarket';
  if (['bekas', 'copotan', 'used', 'second'].includes(v)) return 'used';
  return null;
}

/** "Honda Beat FI 2016-2020; Yamaha NMAX 155 2015" → fitments. Error berisi bagian yang tidak terbaca. */
export function parseFitments(s: string): { fitments: MotorFitment[]; errors: string[] } {
  const fitments: MotorFitment[] = [];
  const errors: string[] = [];
  const thisYear = new Date().getFullYear();
  for (const part of (s || '').split(/[;,\n|]+/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\S+)\s+(.+?)\s+((?:19|20)\d{2})\s*(?:-\s*((?:19|20)\d{2})?)?$/.exec(part);
    if (!m) {
      errors.push(part);
      continue;
    }
    const from = Number(m[3]);
    const to = m[4] ? Number(m[4]) : part.includes('-') ? thisYear : from;
    fitments.push({ brand: m[1], model: m[2], year_from: Math.min(from, to), year_to: Math.max(from, to) });
  }
  return { fitments, errors };
}

export function formatFitments(fits: MotorFitment[]): string {
  return fits.map((f) => `${f.brand} ${f.model} ${f.year_from}-${f.year_to}`).join('; ');
}

// ---------- Export ----------

const PART_TYPE_LABEL: Record<PartType, string> = { oem: 'Original', aftermarket: 'KW', used: 'Bekas' };

function csvCell(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return '';
  let s = String(v);
  // Cegah CSV injection: teks yang diawali = + - @ (atau tab/CR) dijalankan Excel sebagai rumus
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, lines: string[][]) {
  // Pakai ";" + BOM supaya langsung rapi saat dibuka di Excel versi Indonesia
  const body = '﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function productToRow(p: Product): string[] {
  const values: Record<keyof ProductCsvRow, string | number> = {
    sku: p.sku,
    name: p.name,
    part_number: p.part_number,
    barcode: p.barcode,
    brand: p.brand,
    category: p.category,
    part_type: PART_TYPE_LABEL[p.part_type],
    unit: p.unit,
    sell_price: p.sell_price,
    sell_price_2: p.sell_price_2 ?? '',
    avg_cost: p.avg_cost,
    stock_qty: p.stock_qty,
    min_stock: p.min_stock,
    rack_location: p.rack_location,
    fitments: formatFitments(p.fitments),
  };
  return CSV_COLUMNS.map((c) => String(values[c.key]));
}

export function exportProductsCsv(products: Product[]) {
  downloadCsv(`native_motor_produk_${new Date().toISOString().slice(0, 10)}.csv`, [
    CSV_COLUMNS.map((c) => c.header),
    ...products.filter((p) => p.is_active).map(productToRow),
  ]);
}

export function downloadTemplateCsv() {
  downloadCsv('template_import_produk.csv', [
    CSV_COLUMNS.map((c) => c.header),
    [
      'NM-BRK-101', 'Kampas Rem Depan Beat FI', '06455-K44-V01', '8991234560012', 'Honda Genuine Parts', 'Sistem Pengereman',
      'Original', 'set', '45000', '40000', '32000', '10', '5', 'A-01', 'Honda Beat FI 2014-2024; Honda Scoopy 2015-2024',
    ],
    [
      'NM-OIL-102', 'Oli Mesin Matic 0.8L', '', '', 'Federal', 'Oli & Pelumas',
      'KW', 'botol', '55.000', '', '42.000', '24', '6', 'C-02', '',
    ],
  ]);
}
