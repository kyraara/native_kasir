import React, { useMemo, useState } from 'react';
import { Printer, Trash2, Wand2 } from 'lucide-react';
import type { Product } from '../../types';
import { ProductPicker } from '../common/ProductPicker';
import { EmptyState } from '../common/Brand';
import { code128Svg, generateInternalBarcode, isEncodable } from '../../utils/barcode';
import { printHtml, escapeHtml as e } from '../../utils/print';
import { formatRupiah } from '../../utils/pricing';

interface Props {
  products: Product[];
  onSaveProduct: (p: Product) => Promise<boolean>;
}

const SIZES = {
  '33x15': { w: 33, h: 15, label: '33 × 15 mm (kecil)' },
  '50x25': { w: 50, h: 25, label: '50 × 25 mm (sedang)' },
} as const;
type SizeKey = keyof typeof SIZES;

/** Kode yang dicetak: barcode produk, atau SKU bila belum punya barcode */
const codeOf = (p: Product) => (p.barcode && isEncodable(p.barcode) ? p.barcode : p.sku);

export function LabelPrintView({ products, onSaveProduct }: Props) {
  const [rows, setRows] = useState<Array<{ id: string; qty: number }>>([]);
  const [size, setSize] = useState<SizeKey>('50x25');
  const [showPrice, setShowPrice] = useState(true);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selected = rows.map((r) => ({ ...r, product: byId.get(r.id) })).filter((r) => r.product) as Array<{ id: string; qty: number; product: Product }>;
  const totalLabels = selected.reduce((a, r) => a + r.qty, 0);
  const withoutBarcode = selected.filter((r) => !r.product.barcode);

  const add = (p: Product) =>
    setRows((prev) => (prev.some((r) => r.id === p.id) ? prev.map((r) => (r.id === p.id ? { ...r, qty: r.qty + 1 } : r)) : [...prev, { id: p.id, qty: Math.max(1, Math.min(p.stock_qty, 50)) }]));

  const addAllWithoutBarcode = () => {
    const missing = products.filter((p) => p.is_active && !p.barcode && !rows.some((r) => r.id === p.id));
    setRows([...rows, ...missing.map((p) => ({ id: p.id, qty: 1 }))]);
  };

  const generateMissing = async () => {
    if (!withoutBarcode.length) return;
    if (!window.confirm(`Buat barcode internal untuk ${withoutBarcode.length} produk yang belum punya barcode?`)) return;
    setBusy(true);
    const used = new Set(products.map((p) => p.barcode).filter(Boolean));
    for (const r of withoutBarcode) {
      const code = generateInternalBarcode(used);
      used.add(code);
      await onSaveProduct({ ...r.product, barcode: code });
    }
    setBusy(false);
  };

  const print = () => {
    const { w, h } = SIZES[size];
    const small = size === '33x15';
    const labels = selected.flatMap((r) => Array.from({ length: r.qty }, () => r.product));
    const html = labels
      .map((p) => {
        const code = codeOf(p);
        return `<div class="l">
          <div class="n">${e(p.name)}</div>
          ${showPrice && !small ? `<div class="p">${e(formatRupiah(p.sell_price))}</div>` : ''}
          <div class="b">${code128Svg(code, { height: 40 })}</div>
          <div class="c">${e(code)}${showPrice && small ? ` · ${e(formatRupiah(p.sell_price, false))}` : ''}</div>
        </div>`;
      })
      .join('');
    const css = `
      @page { size: ${w}mm ${h}mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; }
      body { font-family: Arial, Helvetica, sans-serif; color: #000; }
      .l { width: ${w}mm; height: ${h}mm; padding: ${small ? '0.8mm 1.5mm' : '1.2mm 2mm'}; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
      .n { font-size: ${small ? 5.5 : 7.5}pt; font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .p { font-size: 9pt; font-weight: 700; }
      .b { flex: 1; min-height: 0; margin-top: 0.5mm; }
      .b svg { width: 100%; height: 100%; display: block; }
      .c { font-size: ${small ? 5 : 6.5}pt; text-align: center; letter-spacing: 0.3px; white-space: nowrap; overflow: hidden; }`;
    printHtml(html, css, `Label barcode (${labels.length})`);
  };

  const preview = selected[0]?.product;

  return (
    <div className="flex flex-col gap-3 pb-8">
      <div className="panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#111113]">Cetak Label Barcode</h2>
          <p className="text-xs text-[#5B5B63] mt-0.5">Untuk printer label thermal (Code 128 — terbaca semua scanner kasir). Produk tanpa barcode bisa dibuatkan barcode internal.</p>
        </div>
        <button
          onClick={print}
          disabled={!totalLabels}
          className="px-5 py-2.5 rounded-[12px] bg-[#111113] text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
        >
          <Printer size={15} /> Cetak {totalLabels} Label
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-8 panel p-5 flex flex-col gap-3 text-xs">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="flex-1">
              <ProductPicker products={products.filter((p) => p.is_active)} onPick={add} pickedIds={rows.map((r) => r.id)} placeholder="Cari / scan produk untuk dicetak labelnya…" />
            </div>
            <button onClick={addAllWithoutBarcode} className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-semibold shrink-0">
              + Semua yang belum ada barcode
            </button>
          </div>

          {selected.length === 0 ? (
            <EmptyState mascot="data-kosong" title="Belum ada produk dipilih" description="Cari atau scan produk di atas. Jumlah label awal = stok saat ini (maks. 50)." />
          ) : (
            <table className="w-full text-left">
              <thead className="bg-[#F4F4F5] text-[#5B5B63] text-[11px] uppercase">
                <tr>
                  <th className="p-2">Produk</th>
                  <th className="p-2">Kode di label</th>
                  <th className="p-2 text-center">Jumlah label</th>
                  <th className="p-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {selected.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2">
                      <div className="font-semibold text-[#111113]">{r.product.name}</div>
                      <div className="text-[11px] text-[#71717A]">
                        {formatRupiah(r.product.sell_price)} · stok {r.product.stock_qty}
                      </div>
                    </td>
                    <td className="p-2 font-mono">
                      {codeOf(r.product)}
                      {!r.product.barcode && <div className="text-[10px] text-[#D97706] font-sans">belum ada barcode — dipakai SKU</div>}
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={r.qty}
                        onChange={(ev) => setRows(rows.map((x) => (x.id === r.id ? { ...x, qty: Math.max(1, Math.min(500, parseInt(ev.target.value, 10) || 1)) } : x)))}
                        className="w-20 px-2 py-1 rounded bg-[#F4F4F5] text-center font-mono font-bold outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <button onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="p-1 rounded text-[#DC2626] hover:bg-[#FEE2E2]">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {withoutBarcode.length > 0 && (
            <button
              onClick={generateMissing}
              disabled={busy}
              className="self-start px-3 py-2 rounded-[10px] bg-[#FEF3C7] text-[#92400E] font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Wand2 size={13} /> Buat barcode internal untuk {withoutBarcode.length} produk
            </button>
          )}
        </div>

        <div className="lg:col-span-4 panel p-5 flex flex-col gap-3 text-xs">
          <div className="font-semibold text-sm text-[#111113]">Ukuran label</div>
          {(Object.keys(SIZES) as SizeKey[]).map((k) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={size === k} onChange={() => setSize(k)} /> {SIZES[k].label}
            </label>
          ))}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showPrice} onChange={(ev) => setShowPrice(ev.target.checked)} /> Tampilkan harga
          </label>

          <div className="font-semibold text-sm text-[#111113] mt-2">Pratinjau</div>
          {preview ? (
            <div
              className="bg-white border border-[#A1A1AA] rounded-[4px] p-2 flex flex-col mx-auto"
              style={{ width: SIZES[size].w * 4, height: SIZES[size].h * 4 }}
            >
              <div className="font-bold truncate" style={{ fontSize: size === '33x15' ? 8 : 11 }}>
                {preview.name}
              </div>
              {showPrice && size === '50x25' && <div className="font-bold text-sm">{formatRupiah(preview.sell_price)}</div>}
              <div className="flex-1 min-h-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: code128Svg(codeOf(preview), { height: 40 }) }} />
              <div className="text-center font-mono" style={{ fontSize: size === '33x15' ? 7 : 9 }}>
                {codeOf(preview)}
              </div>
            </div>
          ) : (
            <p className="text-[#71717A]">Pilih produk untuk melihat pratinjau.</p>
          )}
          <p className="text-[11px] text-[#6E6E76]">
            Di dialog cetak, pilih printer label dan pastikan ukuran kertas sama dengan ukuran label. Satu label = satu halaman.
          </p>
        </div>
      </div>
    </div>
  );
}
