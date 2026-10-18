import React, { useState } from 'react';
import { X, Upload, Download, FileSpreadsheet, AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { Product } from '../../types';
import {
  CSV_COLUMNS,
  parseProductCsv,
  parseNumber,
  parsePartType,
  parseFitments,
  downloadTemplateCsv,
  ProductCsvRow,
} from '../../utils/productCsv';
import { importProducts, ImportItem, ImportResult } from '../../utils/api';
import { formatRupiah } from '../../utils/pricing';

interface Props {
  products: Product[];
  onClose: () => void;
  onImported: () => void;
}

interface Prepared {
  fileName: string;
  rows: ProductCsvRow[];
  items: ImportItem[];
  errors: Array<{ row: number; message: string }>;
}

/** Validasi & ubah baris CSV menjadi item import. Nomor baris mengikuti file (header = baris 1). */
function prepare(fileName: string, text: string): Prepared {
  const { rows, missingColumns } = parseProductCsv(text);
  const errors: Prepared['errors'] = [];
  if (missingColumns.length) {
    errors.push({ row: 1, message: `Kolom wajib tidak ada: ${missingColumns.join(', ')}` });
    return { fileName, rows, items: [], errors };
  }

  const items: ImportItem[] = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    const rowErrors: string[] = [];
    if (!r.sku) rowErrors.push('SKU kosong');
    if (!r.name) rowErrors.push('Nama kosong');
    if (r.name.length > 200) rowErrors.push('Nama maksimal 200 karakter');
    const sell = parseNumber(r.sell_price);
    if (sell === null || sell < 0) rowErrors.push('Harga Ecer kosong/tidak valid');
    const partType = parsePartType(r.part_type);
    if (!partType) rowErrors.push(`Jenis "${r.part_type}" tidak dikenal (pakai Original / KW / Bekas)`);
    const fit = parseFitments(r.fitments);
    if (fit.errors.length) rowErrors.push(`Kompatibilitas tidak terbaca: "${fit.errors.join('", "')}" (contoh: Honda Beat FI 2016-2020)`);

    if (rowErrors.length) {
      errors.push({ row, message: rowErrors.join('; ') });
      return;
    }
    items.push({
      sku: r.sku,
      name: r.name,
      part_number: r.part_number,
      barcode: r.barcode,
      brand: r.brand,
      category: r.category,
      part_type: partType!,
      unit: r.unit || 'pcs',
      sell_price: sell!,
      sell_price_2: parseNumber(r.sell_price_2),
      avg_cost: parseNumber(r.avg_cost),
      stock_qty: parseNumber(r.stock_qty),
      min_stock: parseNumber(r.min_stock),
      rack_location: r.rack_location,
      fitments: r.fitments ? fit.fitments : null,
    });
  });
  return { fileName, rows, items, errors };
}

export function ProductImportModal({ products, onClose, onImported }: Props) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingSkus = new Set(products.map((p) => p.sku.toLowerCase()));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setCheck(null);
    const p = prepare(file.name, await file.text());
    setPrepared(p);
    if (p.errors.length || !p.items.length) return;

    // Cek ke server tanpa menyimpan (dry run)
    setBusy(true);
    try {
      setCheck(await importProducts(p.items, true));
    } catch (err: any) {
      setError(err?.message || 'Gagal memeriksa file');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!prepared) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importProducts(prepared.items, false);
      if (res.errors.length) {
        setCheck(res);
        return;
      }
      alert(`Import selesai: ${res.created} produk baru, ${res.updated} produk diperbarui.`);
      onImported();
    } catch (err: any) {
      setError(err?.message || 'Import gagal');
    } finally {
      setBusy(false);
    }
  };

  const allErrors = [...(prepared?.errors || []), ...(check?.errors || [])].sort((a, b) => a.row - b.row);
  const canImport = !!prepared && !!check && allErrors.length === 0 && prepared.items.length > 0 && !busy;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-white rounded-[20px] w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[#E4E4E7] flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base text-[#111113]">Import Produk dari CSV / Excel</h3>
            <p className="text-xs text-[#6E6E76] mt-0.5">
              Produk dicocokkan berdasarkan SKU: SKU baru → produk baru, SKU yang sudah ada → datanya diperbarui.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-[#71717A] hover:bg-[#F4F4F5]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={downloadTemplateCsv}
              className="p-4 rounded-[14px] border border-[#E4E4E7] hover:bg-[#F4F4F5] text-left flex gap-3 items-start"
            >
              <Download size={18} className="text-[#111113] shrink-0" />
              <div>
                <div className="font-semibold text-[#111113]">1. Unduh template</div>
                <div className="text-[#6E6E76] mt-0.5">Isi di Excel, lalu simpan sebagai CSV.</div>
              </div>
            </button>
            <label className="p-4 rounded-[14px] border border-dashed border-[#111113] hover:bg-[#F4F4F5] text-left flex gap-3 items-start cursor-pointer">
              <Upload size={18} className="text-[#111113] shrink-0" />
              <div>
                <div className="font-semibold text-[#111113]">2. Pilih file CSV</div>
                <div className="text-[#6E6E76] mt-0.5">{prepared ? prepared.fileName : 'Pemisah ; atau , keduanya bisa.'}</div>
              </div>
              <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
          </div>

          <details className="rounded-[12px] bg-[#F4F4F5] p-3">
            <summary className="font-semibold text-[#111113] cursor-pointer">Penjelasan kolom</summary>
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[#5B5B63]">
              {CSV_COLUMNS.map((c) => (
                <li key={c.key}>
                  <span className="font-semibold text-[#111113]">
                    {c.header}
                    {c.required && ' *'}
                  </span>
                  {c.hint && ` — ${c.hint}`}
                </li>
              ))}
            </ul>
          </details>

          {busy && (
            <div className="flex items-center gap-2 text-[#5B5B63]">
              <Loader2 size={14} className="animate-spin" /> Memeriksa data…
            </div>
          )}
          {error && <div className="p-3 rounded-[12px] bg-[#FEE2E2] text-[#B91C1C]">{error}</div>}

          {prepared && (
            <>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-[8px] bg-[#F4F4F5] font-semibold">
                  <FileSpreadsheet size={12} className="inline mr-1" />
                  {prepared.rows.length} baris
                </span>
                {check && (
                  <>
                    <span className="px-2.5 py-1 rounded-[8px] bg-[#DCFCE7] text-[#166534] font-semibold">{check.created} produk baru</span>
                    <span className="px-2.5 py-1 rounded-[8px] bg-[#E0F2FE] text-[#075985] font-semibold">{check.updated} diperbarui</span>
                  </>
                )}
                {allErrors.length > 0 && (
                  <span className="px-2.5 py-1 rounded-[8px] bg-[#FEE2E2] text-[#B91C1C] font-semibold">{allErrors.length} baris bermasalah</span>
                )}
              </div>

              {allErrors.length > 0 && (
                <div className="rounded-[12px] border border-[#FCA5A5] p-3 flex flex-col gap-1 max-h-48 overflow-y-auto">
                  <div className="font-semibold text-[#B91C1C] flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={14} /> Perbaiki baris berikut di file, lalu pilih file lagi. Tidak ada data yang disimpan.
                  </div>
                  {allErrors.map((e, i) => (
                    <div key={i} className="text-[#5B5B63]">
                      <span className="font-mono font-semibold text-[#111113]">Baris {e.row}:</span> {e.message}
                    </div>
                  ))}
                </div>
              )}

              {prepared.items.length > 0 && (
                <div className="overflow-x-auto rounded-[12px] border border-[#E4E4E7]">
                  <table className="w-full text-left">
                    <thead className="bg-[#F4F4F5] text-[#5B5B63] text-[11px]">
                      <tr>
                        <th className="p-2">Status</th>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Nama</th>
                        <th className="p-2 text-right">Harga</th>
                        <th className="p-2 text-right">Stok awal</th>
                        <th className="p-2">Motor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepared.items.slice(0, 50).map((it) => {
                        const isUpdate = existingSkus.has(it.sku.toLowerCase());
                        return (
                          <tr key={it.sku} className="border-t border-[#F4F4F5]">
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isUpdate ? 'bg-[#E0F2FE] text-[#075985]' : 'bg-[#DCFCE7] text-[#166534]'}`}>
                                {isUpdate ? 'Update' : 'Baru'}
                              </span>
                            </td>
                            <td className="p-2 font-mono">{it.sku}</td>
                            <td className="p-2">{it.name}</td>
                            <td className="p-2 text-right font-mono">{formatRupiah(it.sell_price)}</td>
                            <td className="p-2 text-right font-mono">{isUpdate ? '—' : it.stock_qty ?? 0}</td>
                            <td className="p-2 text-[#6E6E76]">{it.fitments?.length ? `${it.fitments.length} motor` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {prepared.items.length > 50 && (
                    <div className="p-2 text-center text-[#6E6E76]">…dan {prepared.items.length - 50} baris lainnya</div>
                  )}
                </div>
              )}

              {check && check.updated > 0 && (
                <p className="text-[#6E6E76]">
                  Untuk produk yang sudah ada, kolom HPP Awal & Stok Awal diabaikan — stok hanya berubah lewat transaksi.
                </p>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-[#E4E4E7] flex justify-end gap-2 bg-[#F9FAFB]">
          <button onClick={onClose} className="px-4 py-2 rounded-[12px] text-xs font-semibold text-[#5B5B63] hover:bg-[#F4F4F5]">
            Batal
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport}
            className="px-5 py-2 rounded-[12px] bg-[#111113] text-white text-xs font-semibold hover:bg-[#27272A] disabled:opacity-40 flex items-center gap-2"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Import {prepared?.items.length || 0} Produk
          </button>
        </div>
      </div>
    </div>
  );
}
