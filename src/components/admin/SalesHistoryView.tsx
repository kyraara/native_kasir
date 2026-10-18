import React, { useMemo, useState } from 'react';
import { Search, X, Printer, Ban, Undo2, Receipt, AlertTriangle, Loader2 } from 'lucide-react';
import type { Sale, SaleReturn, StoreSettings, PaymentMethod } from '../../types';
import { formatRupiah, formatDateTimeIndo } from '../../utils/pricing';
import { ThermalReceiptModal } from '../kasir/ThermalReceiptModal';
import type { SaleReturnParams } from '../../utils/api';
import { EmptyState } from '../common/Brand';

interface Props {
  sales: Sale[];
  saleReturns: SaleReturn[];
  settings: StoreSettings;
  onVoidSale: (saleId: string, reason: string) => Promise<boolean>;
  onReturnSale: (saleId: string, params: SaleReturnParams) => Promise<boolean>;
}

type Period = 'today' | '7d' | '30d' | 'all';

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };
const dayKey = (iso: string | Date) => new Date(iso).toLocaleDateString('en-CA');

/** Harga bersih per unit setelah diskon barang & diskon faktur (sama dengan hitungan server) */
function unitRefund(sale: Sale, item: Sale['items'][number]): number {
  const factor = sale.subtotal > 0 ? sale.total / sale.subtotal : 0;
  return Math.round(((item.price * item.qty - item.discount) / item.qty) * factor);
}

export function SalesHistoryView({ sales, saleReturns, settings, onVoidSale, onReturnSale }: Props) {
  const [tab, setTab] = useState<'sales' | 'returns'>('sales');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('7d');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reprint, setReprint] = useState<Sale | null>(null);
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [returning, setReturning] = useState<Sale | null>(null);

  const returnsBySale = useMemo(() => {
    const m = new Map<string, SaleReturn[]>();
    for (const r of saleReturns) m.set(r.sale_id, [...(m.get(r.sale_id) || []), r]);
    return m;
  }, [saleReturns]);

  const returnedQty = (saleId: string, saleItemId: string) =>
    (returnsBySale.get(saleId) || []).reduce(
      (s, r) => s + r.items.filter((i) => i.sale_item_id === saleItemId).reduce((a, i) => a + i.qty, 0),
      0
    );

  const inPeriod = (iso: string) => {
    if (period === 'all') return true;
    if (period === 'today') return dayKey(iso) === dayKey(new Date());
    const days = period === '7d' ? 7 : 30;
    return Date.now() - new Date(iso).getTime() <= days * 86400000;
  };

  const q = query.toLowerCase().trim();
  const filteredSales = sales.filter(
    (s) =>
      inPeriod(s.created_at) &&
      (!q ||
        s.number.toLowerCase().includes(q) ||
        (s.customer_name || '').toLowerCase().includes(q) ||
        (s.vehicle_note || '').toLowerCase().includes(q) ||
        s.items.some((i) => i.product_name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)))
  );
  const filteredReturns = saleReturns.filter(
    (r) =>
      inPeriod(r.created_at) &&
      (!q || r.number.toLowerCase().includes(q) || r.sale_number.toLowerCase().includes(q) || r.items.some((i) => i.product_name.toLowerCase().includes(q)))
  );

  const paidSales = filteredSales.filter((s) => s.status === 'paid');
  const omzet = paidSales.reduce((a, s) => a + s.total, 0);
  const refunds = filteredReturns.reduce((a, r) => a + r.refund_amount, 0);

  const selected = sales.find((s) => s.id === selectedId) || null;

  const voidBlockReason = (s: Sale): string | null => {
    if (s.status === 'void') return 'Sudah di-void';
    if (dayKey(s.created_at) !== dayKey(new Date())) return 'Void hanya di hari yang sama — gunakan Retur';
    if (returnsBySale.get(s.id)?.length) return 'Sudah ada retur';
    return null;
  };
  const canReturn = (s: Sale) => s.status === 'paid' && s.items.some((i) => returnedQty(s.id, i.id) < i.qty);

  return (
    <div className="flex flex-col gap-3 pb-8">
      <div className="panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#111113]">Riwayat Penjualan & Retur</h2>
          <p className="text-xs text-[#5B5B63] mt-0.5">Cari faktur, cetak ulang struk, batalkan (void) di hari yang sama, atau proses retur barang</p>
        </div>
        <div className="flex items-center p-1 rounded-[12px] bg-[#F4F4F5] border border-[#E4E4E7] text-xs font-medium">
          {(['sales', 'returns'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-[10px] ${tab === t ? 'bg-[#111113] text-[#D4FF3F] font-semibold' : 'text-[#6E6E76] hover:text-[#111113]'}`}
            >
              {t === 'sales' ? 'Penjualan' : `Retur (${saleReturns.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="panel p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#71717A]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari no. faktur, pelanggan, plat/motor, nama barang…"
            className="w-full pl-10 pr-4 py-2.5 rounded-[12px] bg-[#F4F4F5] text-xs font-medium outline-none focus:ring-2 focus:ring-[#111113]"
          />
        </div>
        <div className="flex gap-1.5 text-xs">
          {([['today', 'Hari ini'], ['7d', '7 hari'], ['30d', '30 hari'], ['all', 'Semua']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className={`px-3 py-1.5 rounded-[10px] font-medium ${period === k ? 'bg-[#111113] text-white' : 'bg-[#F4F4F5] text-[#5B5B63]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs text-[#5B5B63] md:text-right">
          <div>
            Omzet: <span className="font-bold text-[#111113] num">{formatRupiah(omzet)}</span> · {paidSales.length} trx
          </div>
          {refunds > 0 && <div className="text-[#DC2626]">Retur: -{formatRupiah(refunds)}</div>}
        </div>
      </div>

      {tab === 'sales' && (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">No. Faktur</th>
                  <th className="py-3 px-3">Waktu</th>
                  <th className="py-3 px-3">Pelanggan</th>
                  <th className="py-3 px-3">Barang</th>
                  <th className="py-3 px-3">Bayar</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState mascot={query ? 'pencarian-kosong' : 'data-kosong'} title="Tidak ada transaksi" description="Coba ubah periode atau kata kunci pencarian." />
                    </td>
                  </tr>
                )}
                {filteredSales.map((s) => {
                  const hasReturn = !!returnsBySale.get(s.id)?.length;
                  return (
                    <tr key={s.id} onClick={() => setSelectedId(s.id)} className="hover:bg-[#F9FAFB] cursor-pointer">
                      <td className="py-3 px-3 font-mono font-semibold text-[#111113]">{s.number}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#5B5B63]">{formatDateTimeIndo(s.created_at)}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#111113]">{s.customer_name || 'Umum'}</div>
                        {s.vehicle_note && <div className="text-[11px] text-[#71717A]">{s.vehicle_note}</div>}
                      </td>
                      <td className="py-3 px-3 text-[#5B5B63] max-w-xs truncate">
                        {s.items.map((i) => `${i.product_name} (${i.qty})`).join(', ')}
                      </td>
                      <td className="py-3 px-3 font-semibold">{METHOD_LABEL[s.payment_method]}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold num">{formatRupiah(s.total)}</td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            s.status === 'void'
                              ? 'bg-[#FEE2E2] text-[#DC2626]'
                              : hasReturn
                              ? 'bg-[#FEF3C7] text-[#92400E]'
                              : 'bg-[#DCFCE7] text-[#15803D]'
                          }`}
                        >
                          {s.status === 'void' ? 'Void' : hasReturn ? 'Ada retur' : 'Lunas'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'returns' && (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">No. Retur</th>
                  <th className="py-3 px-3">Waktu</th>
                  <th className="py-3 px-3">Faktur Asal</th>
                  <th className="py-3 px-3">Barang</th>
                  <th className="py-3 px-3">Alasan</th>
                  <th className="py-3 px-3 text-right">Dikembalikan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {filteredReturns.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState mascot="data-kosong" title="Belum ada retur pada periode ini" />
                    </td>
                  </tr>
                )}
                {filteredReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F9FAFB]">
                    <td className="py-3 px-3 font-mono font-semibold">{r.number}</td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[#5B5B63]">{formatDateTimeIndo(r.created_at)}</td>
                    <td className="py-3 px-3">
                      <button onClick={() => setSelectedId(r.sale_id)} className="font-mono underline text-[#111113]">
                        {r.sale_number}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-[#5B5B63]">
                      {r.items.map((i) => (
                        <div key={i.sale_item_id}>
                          {i.product_name} × {i.qty}{' '}
                          <span className={i.condition === 'damaged' ? 'text-[#DC2626]' : 'text-[#16A34A]'}>
                            ({i.condition === 'damaged' ? 'rusak' : 'ke stok'})
                          </span>
                        </div>
                      ))}
                    </td>
                    <td className="py-3 px-3 text-[#5B5B63]">{r.reason}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[#DC2626] num">
                      -{formatRupiah(r.refund_amount)}
                      <div className="text-[10px] font-normal text-[#71717A]">{METHOD_LABEL[r.refund_method]}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail transaksi */}
      {selected && (
        <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={() => setSelectedId(null)}>
          <div className="w-full max-w-md bg-white h-full p-5 overflow-y-auto flex flex-col gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono font-bold text-base text-[#111113]">{selected.number}</div>
                <div className="text-[#6E6E76]">
                  {formatDateTimeIndo(selected.created_at)} · {METHOD_LABEL[selected.payment_method]}
                </div>
                <div className="mt-1 font-semibold">{selected.customer_name || 'Umum'}</div>
                {selected.vehicle_note && <div className="text-[#6E6E76]">{selected.vehicle_note}</div>}
              </div>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded-full hover:bg-[#F4F4F5]">
                <X size={18} />
              </button>
            </div>

            {selected.status === 'void' && (
              <div className="p-3 rounded-[12px] bg-[#FEE2E2] text-[#B91C1C]">
                <b>Transaksi dibatalkan (void).</b> {selected.void_reason && `Alasan: ${selected.void_reason}`}
              </div>
            )}

            <table className="w-full">
              <thead className="text-[#6E6E76] text-[11px]">
                <tr>
                  <th className="text-left py-1">Barang</th>
                  <th className="text-center py-1">Qty</th>
                  <th className="text-right py-1">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {selected.items.map((i) => {
                  const ret = returnedQty(selected.id, i.id);
                  return (
                    <tr key={i.id}>
                      <td className="py-2">
                        <div className="font-semibold text-[#111113]">{i.product_name}</div>
                        <div className="text-[#71717A] font-mono">
                          {i.sku} · {formatRupiah(i.price)}
                          {i.discount > 0 && ` · disc ${formatRupiah(i.discount)}`}
                        </div>
                        {ret > 0 && <div className="text-[#D97706] font-semibold">Diretur {ret}</div>}
                      </td>
                      <td className="py-2 text-center font-mono">{i.qty}</td>
                      <td className="py-2 text-right font-mono num">{formatRupiah(i.price * i.qty - i.discount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex flex-col gap-1 border-t border-[#E4E4E7] pt-3">
              {selected.discount > 0 && (
                <div className="flex justify-between text-[#DC2626]">
                  <span>Diskon faktur</span>
                  <span className="num">-{formatRupiah(selected.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm">
                <span>Total</span>
                <span className="num">{formatRupiah(selected.total)}</span>
              </div>
            </div>

            {(returnsBySale.get(selected.id) || []).map((r) => (
              <div key={r.id} className="p-3 rounded-[12px] bg-[#FEF3C7] text-[#92400E]">
                <div className="font-semibold">
                  {r.number} · {formatDateTimeIndo(r.created_at)} · -{formatRupiah(r.refund_amount)}
                </div>
                <div>{r.items.map((i) => `${i.product_name} × ${i.qty} (${i.condition === 'damaged' ? 'rusak' : 'ke stok'})`).join(', ')}</div>
                <div className="italic">Alasan: {r.reason}</div>
              </div>
            ))}

            <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-[#E4E4E7]">
              <button
                onClick={() => setReprint(selected)}
                className="py-2.5 rounded-[12px] bg-[#F4F4F5] hover:bg-[#E4E4E7] font-semibold flex items-center justify-center gap-2"
              >
                <Printer size={14} /> Cetak Ulang / Kirim WA
              </button>
              <button
                disabled={!canReturn(selected)}
                onClick={() => setReturning(selected)}
                className="py-2.5 rounded-[12px] bg-[#111113] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Undo2 size={14} /> Retur Barang
              </button>
              <button
                disabled={!!voidBlockReason(selected)}
                onClick={() => setVoiding(selected)}
                title={voidBlockReason(selected) || ''}
                className="py-2.5 rounded-[12px] bg-[#FEE2E2] text-[#B91C1C] font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Ban size={14} /> Void Transaksi
              </button>
              {voidBlockReason(selected) && selected.status !== 'void' && (
                <p className="text-[11px] text-[#71717A] text-center">{voidBlockReason(selected)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {reprint && <ThermalReceiptModal sale={reprint} settings={settings} onClose={() => setReprint(null)} />}

      {voiding && (
        <VoidModal
          sale={voiding}
          onClose={() => setVoiding(null)}
          onConfirm={async (reason) => {
            if (await onVoidSale(voiding.id, reason)) setVoiding(null);
          }}
        />
      )}

      {returning && (
        <ReturnModal
          sale={returning}
          returnedQty={(itemId) => returnedQty(returning.id, itemId)}
          onClose={() => setReturning(null)}
          onConfirm={async (params) => {
            if (await onReturnSale(returning.id, params)) setReturning(null);
          }}
        />
      )}
    </div>
  );
}

const VOID_REASONS = ['Salah input barang', 'Salah jumlah', 'Pembeli batal', 'Salah metode bayar'];

function VoidModal({ sale, onClose, onConfirm }: { sale: Sale; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[20px] w-full max-w-sm p-5 flex flex-col gap-3 text-xs" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-base text-[#111113] flex items-center gap-2">
          <AlertTriangle size={18} className="text-[#DC2626]" /> Void {sale.number}?
        </h3>
        <p className="text-[#5B5B63]">
          Transaksi {formatRupiah(sale.total)} akan dibatalkan dan semua stok barangnya dikembalikan. Kembalikan uang ke pembeli secara manual.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {VOID_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`px-2.5 py-1 rounded-[8px] ${reason === r ? 'bg-[#111113] text-white' : 'bg-[#F4F4F5] text-[#5B5B63]'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan pembatalan (wajib)"
          className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none"
        />
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-[10px] text-[#5B5B63] hover:bg-[#F4F4F5] font-semibold">
            Batal
          </button>
          <button
            disabled={!reason.trim() || busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(reason.trim());
              setBusy(false);
            }}
            className="px-4 py-2 rounded-[10px] bg-[#DC2626] text-white font-semibold disabled:opacity-40 flex items-center gap-2"
          >
            {busy && <Loader2 size={13} className="animate-spin" />} Ya, Void
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({
  sale,
  returnedQty,
  onClose,
  onConfirm,
}: {
  sale: Sale;
  returnedQty: (saleItemId: string) => number;
  onClose: () => void;
  onConfirm: (p: SaleReturnParams) => Promise<void>;
}) {
  const [lines, setLines] = useState<Record<string, { qty: number; condition: 'restock' | 'damaged' }>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(sale.payment_method);
  const [busy, setBusy] = useState(false);

  const setLine = (id: string, patch: Partial<{ qty: number; condition: 'restock' | 'damaged' }>) =>
    setLines((prev) => ({ ...prev, [id]: { ...(prev[id] || { qty: 0, condition: 'restock' }), ...patch } }));

  const total = sale.items.reduce((s, i) => s + (lines[i.id]?.qty || 0) * unitRefund(sale, i), 0);
  const items = Object.entries(lines)
    .filter(([, l]) => l.qty > 0)
    .map(([sale_item_id, l]) => ({ sale_item_id, qty: l.qty, condition: l.condition }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[20px] w-full max-w-lg max-h-[92vh] flex flex-col text-xs overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#E4E4E7]">
          <h3 className="font-semibold text-base text-[#111113] flex items-center gap-2">
            <Receipt size={18} /> Retur dari {sale.number}
          </h3>
          <p className="text-[#6E6E76]">Pilih barang & jumlah yang dikembalikan pembeli.</p>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-3">
          {sale.items.map((i) => {
            const left = i.qty - returnedQty(i.id);
            const l = lines[i.id] || { qty: 0, condition: 'restock' as const };
            return (
              <div key={i.id} className={`p-3 rounded-[12px] border ${l.qty > 0 ? 'border-[#111113]' : 'border-[#E4E4E7]'} ${left === 0 ? 'opacity-50' : ''}`}>
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#111113]">{i.product_name}</div>
                    <div className="text-[#71717A]">
                      Bisa diretur {left} dari {i.qty} · {formatRupiah(unitRefund(sale, i))}/unit
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button disabled={l.qty <= 0} onClick={() => setLine(i.id, { qty: l.qty - 1 })} className="w-7 h-7 rounded-[8px] bg-[#F4F4F5] font-bold disabled:opacity-30">
                      −
                    </button>
                    <span className="w-6 text-center font-mono font-bold">{l.qty}</span>
                    <button disabled={l.qty >= left} onClick={() => setLine(i.id, { qty: l.qty + 1 })} className="w-7 h-7 rounded-[8px] bg-[#F4F4F5] font-bold disabled:opacity-30">
                      +
                    </button>
                  </div>
                </div>
                {l.qty > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    {(['restock', 'damaged'] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setLine(i.id, { condition: c })}
                        className={`px-2.5 py-1 rounded-[8px] font-semibold ${
                          l.condition === c ? (c === 'restock' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#B91C1C]') : 'bg-[#F4F4F5] text-[#5B5B63]'
                        }`}
                      >
                        {c === 'restock' ? 'Masih bagus → kembali ke stok' : 'Rusak → tidak masuk stok'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan retur (wajib), mis. salah tipe / tidak cocok motor"
            className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none"
          />
          <div className="flex items-center gap-2">
            <span className="text-[#5B5B63]">Uang dikembalikan via:</span>
            {(['cash', 'qris', 'transfer'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`px-2.5 py-1 rounded-[8px] font-semibold ${method === m ? 'bg-[#111113] text-white' : 'bg-[#F4F4F5] text-[#5B5B63]'}`}
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-[#E4E4E7] flex items-center justify-between bg-[#F9FAFB]">
          <div>
            <div className="text-[#6E6E76]">Dikembalikan ke pembeli</div>
            <div className="font-bold text-lg num">{formatRupiah(total)}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-[10px] text-[#5B5B63] hover:bg-[#F4F4F5] font-semibold">
              Batal
            </button>
            <button
              disabled={!items.length || !reason.trim() || busy}
              onClick={async () => {
                setBusy(true);
                await onConfirm({ reason: reason.trim(), refund_method: method, items });
                setBusy(false);
              }}
              className="px-4 py-2 rounded-[10px] bg-[#111113] text-white font-semibold disabled:opacity-40 flex items-center gap-2"
            >
              {busy && <Loader2 size={13} className="animate-spin" />} Proses Retur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
