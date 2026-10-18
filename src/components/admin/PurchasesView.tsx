import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Building2,
  CreditCard,
  Plus,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  ArrowRight,
  TrendingUp,
  History,
  Undo2,
  Loader2,
} from 'lucide-react';
import { Product, Supplier, Purchase, PurchaseReturn } from '../../types';
import { ProductPicker } from '../common/ProductPicker';
import { formatDateTimeIndo } from '../../utils/pricing';
import { formatRupiah, calculateMovingAverageCost } from '../../utils/pricing';

interface PurchasesViewProps {
  products: Product[];
  suppliers: Supplier[];
  purchases: Purchase[];
  purchaseReturns: PurchaseReturn[];
  initialTab?: 'receiving' | 'suppliers' | 'debts' | 'history';
  prefilledProduct?: Product | null;
  prefilledQty?: number;
  onProcessPurchase: (purchase: {
    supplier_id: string;
    supplier_name: string;
    invoice_no: string;
    due_date: string;
    payment_status: 'paid' | 'credit' | 'partial';
    paid_amount: number;
    items: Array<{ product_id: string; qty: number; cost: number }>;
    note?: string;
  }) => Promise<boolean>;
  onSaveSupplier: (supplier: Supplier) => Promise<boolean>;
  onPayDebt: (purchaseId: string, amount: number) => Promise<boolean>;
  onReturnPurchase: (purchaseId: string, params: { reason: string; items: Array<{ product_id: string; qty: number }> }) => Promise<boolean>;
}

/** Sisa hutang faktur = total − dibayar − dipotong retur */
export const outstandingOf = (p: Purchase) => Math.max(0, p.total - p.paid_amount - (p.returned_amount || 0));

const todayKey = () => new Date().toLocaleDateString('en-CA');
const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
};

/** Label jatuh tempo: "Lewat 3 hari", "Hari ini", "H-2", atau tanggal */
export function dueLabel(dueDate: string): { text: string; tone: 'late' | 'soon' | 'ok' } {
  if (!dueDate) return { text: '—', tone: 'ok' };
  const diff = Math.round((new Date(dueDate + 'T00:00:00').getTime() - new Date(todayKey() + 'T00:00:00').getTime()) / 86400000);
  if (diff < 0) return { text: `Lewat ${-diff} hari`, tone: 'late' };
  if (diff === 0) return { text: 'Jatuh tempo hari ini', tone: 'late' };
  if (diff <= 3) return { text: `H-${diff}`, tone: 'soon' };
  return { text: `${diff} hari lagi`, tone: 'ok' };
}

export function PurchasesView({
  products,
  suppliers,
  purchases,
  purchaseReturns,
  initialTab = 'receiving',
  prefilledProduct,
  prefilledQty,
  onProcessPurchase,
  onSaveSupplier,
  onPayDebt,
  onReturnPurchase,
}: PurchasesViewProps) {
  const [tab, setTab] = useState<'receiving' | 'suppliers' | 'debts' | 'history'>(initialTab);
  // Ikuti menu sidebar saat komponen sudah terbuka (mis. dari Terima Barang → Hutang)
  useEffect(() => setTab(initialTab), [initialTab]);
  const [debtFilter, setDebtFilter] = useState<'unpaid' | 'all'>('unpaid');
  const [returningPurchase, setReturningPurchase] = useState<Purchase | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Receiving Goods form state
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    suppliers[0]?.id || ''
  );
  const [invoiceNo, setInvoiceNo] = useState('');
  const initialSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const [termType, setTermType] = useState<'lunas' | 'tempo'>(initialSupplier?.default_term_days === 0 ? 'lunas' : 'tempo');
  const [dueDate, setDueDate] = useState(() => addDays(initialSupplier?.default_term_days || 14));
  const [paidDeposit, setPaidDeposit] = useState<number>(0);
  const [receivingItems, setReceivingItems] = useState<Array<{ product_id: string; qty: number; cost: number }>>(() =>
    prefilledProduct
      ? [{ product_id: prefilledProduct.id, qty: prefilledQty || 1, cost: prefilledProduct.avg_cost }]
      : []
  );
  const [receiveSuccess, setReceiveSuccess] = useState(false);

  // Pay Debt Modal state
  const [payingPurchase, setPayingPurchase] = useState<Purchase | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);

  // Supplier modal state
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState<Supplier>({
    id: '',
    name: '',
    phone: '',
    address: '',
    default_term_days: 14,
    note: '',
  });
  const isEditingSupplier = suppliers.some((s) => s.id === newSupplier.id);

  // ID baru dibuat setiap kali form dibuka, supaya supplier baru tidak menimpa yang lama
  const openSupplierModal = (sup?: Supplier) => {
    setNewSupplier(
      sup
        ? { ...sup, note: sup.note || '' }
        : { id: `sup-${Date.now()}`, name: '', phone: '', address: '', default_term_days: 14, note: '' }
    );
    setIsSupplierModalOpen(true);
  };

  const outstandingBySupplier = purchases.reduce<Record<string, number>>((acc, p) => {
    if (p.payment_status !== 'paid') acc[p.supplier_id] = (acc[p.supplier_id] || 0) + (p.total - p.paid_amount);
    return acc;
  }, {});

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

  const totalReceivingCost = receivingItems.reduce((acc, it) => acc + it.cost * it.qty, 0);

  // BLI-04: harga beli terakhir per produk (dari faktur pembelian terbaru)
  const lastCostByProduct = useMemo(() => {
    const m = new Map<string, { cost: number; supplier: string }>();
    const sorted = [...purchases].sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const pur of sorted) for (const it of pur.items) if (!m.has(it.product_id)) m.set(it.product_id, { cost: it.cost, supplier: pur.supplier_name });
    return m;
  }, [purchases]);

  const handlePickProduct = (p: Product) => {
    const existing = receivingItems.findIndex((it) => it.product_id === p.id);
    if (existing >= 0) {
      setReceivingItems(receivingItems.map((it, i) => (i === existing ? { ...it, qty: it.qty + 1 } : it)));
    } else {
      setReceivingItems([...receivingItems, { product_id: p.id, qty: 1, cost: lastCostByProduct.get(p.id)?.cost ?? p.avg_cost }]);
    }
  };

  const updateItem = (idx: number, patch: Partial<{ qty: number; cost: number }>) =>
    setReceivingItems(receivingItems.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const handleSubmitReceiving = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return alert('Pilih supplier dulu');
    if (receivingItems.length === 0) return alert('Tambahkan minimal satu barang');
    if (receivingItems.some((it) => it.qty <= 0)) return alert('Jumlah barang harus lebih dari 0');

    const payment_status =
      termType === 'lunas' ? 'paid' : paidDeposit >= totalReceivingCost ? 'paid' : paidDeposit > 0 ? 'partial' : 'credit';

    setSubmitting(true);
    const ok = await onProcessPurchase({
      supplier_id: selectedSupplier.id,
      supplier_name: selectedSupplier.name,
      invoice_no: invoiceNo.trim(),
      due_date: termType === 'lunas' ? '' : dueDate,
      payment_status,
      paid_amount: termType === 'lunas' ? totalReceivingCost : paidDeposit,
      items: receivingItems,
    });
    setSubmitting(false);
    if (!ok) return;

    setReceiveSuccess(true);
    setInvoiceNo('');
    setReceivingItems([]);
    setPaidDeposit(0);
    setTimeout(() => setReceiveSuccess(false), 4000);
  };

  const debtRows = purchases
    .filter((p) => debtFilter === 'all' || outstandingOf(p) > 0)
    .sort((a, b) =>
      debtFilter === 'unpaid' ? (a.due_date || '9999').localeCompare(b.due_date || '9999') : b.created_at.localeCompare(a.created_at)
    );
  const totalOutstanding = purchases.reduce((a, p) => a + outstandingOf(p), 0);
  const dueSoonCount = purchases.filter((p) => outstandingOf(p) > 0 && p.due_date && dueLabel(p.due_date).tone !== 'ok').length;

  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Top Header & Sub-tab Switcher */}
      <div className="panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#111113]">
            Pembelian & Hutang Supplier
          </h2>
          <p className="text-xs text-[#5B5B63] mt-0.5">
            Penerimaan barang masuk, kalkulasi HPP otomatis, dan pengingat jatuh tempo
          </p>
        </div>

        <div className="flex items-center p-1 rounded-[12px] bg-[#F4F4F5] border border-[#E4E4E7] text-xs font-medium">
          <button
            onClick={() => setTab('receiving')}
            className={`px-3.5 py-1.5 rounded-[10px] transition-all flex items-center gap-1.5 ${
              tab === 'receiving'
                ? 'bg-[#111113] text-[#D4FF3F] font-semibold shadow-xs'
                : 'text-[#6E6E76] hover:text-[#111113]'
            }`}
          >
            <Truck size={14} />
            <span>Terima Barang</span>
          </button>

          <button
            onClick={() => setTab('debts')}
            className={`px-3.5 py-1.5 rounded-[10px] transition-all flex items-center gap-1.5 ${
              tab === 'debts'
                ? 'bg-white text-[#111113] font-semibold shadow-xs'
                : 'text-[#6E6E76] hover:text-[#111113]'
            }`}
          >
            <CreditCard size={14} />
            <span>Hutang & Tempo</span>
            {dueSoonCount > 0 && <span className="w-2 h-2 rounded-full bg-[#D97706]" />}
          </button>

          <button
            onClick={() => setTab('suppliers')}
            className={`px-3.5 py-1.5 rounded-[10px] transition-all flex items-center gap-1.5 ${
              tab === 'suppliers'
                ? 'bg-white text-[#111113] font-semibold shadow-xs'
                : 'text-[#6E6E76] hover:text-[#111113]'
            }`}
          >
            <Building2 size={14} />
            <span>Daftar Supplier</span>
          </button>

          <button
            onClick={() => setTab('history')}
            className={`px-3.5 py-1.5 rounded-[10px] transition-all flex items-center gap-1.5 ${
              tab === 'history' ? 'bg-white text-[#111113] font-semibold shadow-xs' : 'text-[#6E6E76] hover:text-[#111113]'
            }`}
          >
            <History size={14} />
            <span>Riwayat & Retur</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TERIMA BARANG (Penerimaan Barang & HPP Update) */}
      {tab === 'receiving' && (
        <div className="panel p-6 flex flex-col gap-5">
          <div className="border-b border-[#E4E4E7] pb-4">
            <h3 className="text-lg font-semibold text-[#111113]">Catat Penerimaan Barang Masuk</h3>
            <p className="text-xs text-[#5B5B63]">
              Masukkan harga beli aktual dari faktur supplier. HPP produk akan dihitung ulang secara otomatis menggunakan rata-rata tertimbang (Moving Average).
            </p>
          </div>

          {receiveSuccess && (
            <div className="p-3.5 rounded-[14px] bg-[#DCFCE7] text-[#15803D] text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>Penerimaan barang berhasil dicatat! Stok bertambah dan HPP produk telah terupdate.</span>
            </div>
          )}

          <form onSubmit={handleSubmitReceiving} className="flex flex-col gap-5 text-xs">
            {/* Supplier & Invoice metadata */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-[16px] bg-[#F4F4F5]">
              <div>
                <label className="font-semibold text-[#111113] block mb-1">Supplier</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => {
                    setSelectedSupplierId(e.target.value);
                    const sup = suppliers.find((s) => s.id === e.target.value);
                    if (sup) {
                      // BLI-06: jatuh tempo otomatis dari termin supplier
                      setDueDate(addDays(sup.default_term_days));
                      setTermType(sup.default_term_days === 0 ? 'lunas' : 'tempo');
                    }
                  }}
                  className="w-full px-3 py-2 rounded-[10px] bg-white font-medium text-[#111113] outline-none"
                >
                  {suppliers.length === 0 && <option value="">Belum ada supplier — tambah di tab Daftar Supplier</option>}
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.default_term_days ? `${s.default_term_days} hari tempo` : 'tunai'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#111113] block mb-1">No. Faktur Supplier</label>
                <input
                  type="text"
                  placeholder="opsional, mis. DAM-INV-2026-99"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-[10px] bg-white font-mono text-[#111113] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111113] block mb-1">Metode Pembayaran</label>
                <select
                  value={termType}
                  onChange={(e) => setTermType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-[10px] bg-white font-medium text-[#111113] outline-none"
                >
                  <option value="tempo">Tempo / Kredit Supplier</option>
                  <option value="lunas">Bayar Lunas (Tunai/Transfer)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#111113] block mb-1">Jatuh Tempo</label>
                <input
                  type="date"
                  disabled={termType === 'lunas'}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-[10px] bg-white font-mono text-[#111113] outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Item Rows */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <h4 className="font-semibold text-sm text-[#111113]">Item Barang yang Diterima</h4>
                <div className="md:w-96">
                  <ProductPicker
                    products={products.filter((p) => p.is_active)}
                    onPick={handlePickProduct}
                    pickedIds={receivingItems.map((it) => it.product_id)}
                    placeholder="Cari / scan barang untuk ditambahkan…"
                  />
                </div>
              </div>

              <div className="border border-[#E4E4E7] rounded-[16px] overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Produk</th>
                      <th className="py-2.5 px-3 text-center">Stok Lama</th>
                      <th className="py-2.5 px-3 text-center">Qty Masuk</th>
                      <th className="py-2.5 px-3 text-right">Harga Beli Baru</th>
                      <th className="py-2.5 px-3 text-right">HPP Baru (Moving Avg)</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F4F5]">
                    {receivingItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-[#71717A]">
                          Belum ada barang. Cari atau scan barang di kolom pencarian di atas.
                        </td>
                      </tr>
                    )}
                    {receivingItems.map((item, idx) => {
                      const prod = products.find((p) => p.id === item.product_id);
                      const currentAvg = prod?.avg_cost || 0;
                      const currentStock = prod?.stock_qty || 0;
                      const newAvg = calculateMovingAverageCost(currentStock, currentAvg, item.qty, item.cost);
                      const last = lastCostByProduct.get(item.product_id);
                      const diffLast = last ? item.cost - last.cost : 0;
                      const margin = prod && prod.sell_price > 0 ? Math.round(((prod.sell_price - newAvg) / prod.sell_price) * 100) : null;

                      return (
                        <tr key={item.product_id} className="hover:bg-[#F9FAFB]">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#111113]">{prod?.name || 'Produk dihapus'}</div>
                            <div className="text-[11px] text-[#71717A] font-mono">{prod?.part_number || prod?.sku}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono num">
                            {currentStock} {prod?.unit}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => updateItem(idx, { qty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              className="w-20 px-2 py-1 rounded bg-[#F4F4F5] text-center font-mono font-bold text-[#111113] outline-none"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={item.cost}
                              onChange={(e) => updateItem(idx, { cost: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              className="w-28 px-2 py-1 rounded bg-[#F4F4F5] text-right font-mono font-bold text-[#111113] outline-none"
                            />
                            <div className="text-[10px] mt-0.5">
                              {last ? (
                                <span className={diffLast > 0 ? 'text-[#DC2626]' : diffLast < 0 ? 'text-[#16A34A]' : 'text-[#71717A]'}>
                                  Terakhir {formatRupiah(last.cost)}
                                  {diffLast !== 0 && ` (${diffLast > 0 ? 'naik' : 'turun'} ${formatRupiah(Math.abs(diffLast))})`}
                                </span>
                              ) : (
                                <span className="text-[#71717A]">Belum pernah dibeli</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono num">
                            <span className="font-semibold text-[#111113]">{formatRupiah(newAvg)}</span>
                            {margin !== null && (
                              <div className={`text-[10px] ${margin < 10 ? 'text-[#DC2626]' : 'text-[#71717A]'}`}>
                                margin {margin}% dari harga jual {formatRupiah(prod!.sell_price)}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#111113] num">
                            {formatRupiah(item.cost * item.qty)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setReceivingItems(receivingItems.filter((_, i) => i !== idx))}
                              className="text-[#DC2626] hover:bg-[#FEE2E2] p-1 rounded"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total & Submit */}
            <div className="flex flex-col md:flex-row md:items-center justify-between pt-4 border-t border-[#E4E4E7] gap-4">
              <div>
                <span className="text-xs text-[#5B5B63]">Total Nilai Faktur Pembelian:</span>
                <div className="text-2xl font-bold font-mono text-[#111113] num">
                  {formatRupiah(totalReceivingCost)}
                </div>
              </div>

              {termType === 'tempo' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#5B5B63]">DP / Uang Muka Dibayar (Rp):</span>
                  <input
                    type="number"
                    value={paidDeposit}
                    onChange={(e) => setPaidDeposit(parseInt(e.target.value, 10) || 0)}
                    placeholder="0 jika full kredit"
                    className="w-36 px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono text-xs text-[#111113] outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || receivingItems.length === 0}
                className="px-6 py-3 rounded-[14px] bg-[#111113] text-white hover:bg-[#27272A] font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
                <span>Simpan Penerimaan & Update Stok</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: HUTANG & TEMPO SUPPLIER */}
      {tab === 'debts' && (
        <div className="panel p-6 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#E4E4E7] gap-2">
            <div>
              <h3 className="text-lg font-semibold text-[#111113]">Monitoring Hutang Supplier</h3>
              <p className="text-xs text-[#5B5B63]">
                Daftar faktur tempo yang belum lunas. Pantau tanggal jatuh tempo agar tidak terlewat.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-[10px] bg-[#2A2A2E] text-[#FBBF24] font-medium num">
                Total hutang {formatRupiah(totalOutstanding)}
                {dueSoonCount > 0 && ` · ${dueSoonCount} jatuh tempo ≤ 3 hari / lewat`}
              </span>
              <div className="flex p-0.5 rounded-[10px] bg-[#F4F4F5]">
                {(['unpaid', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setDebtFilter(f)}
                    className={`px-2.5 py-1 rounded-[8px] font-medium ${debtFilter === f ? 'bg-white text-[#111113] shadow-xs' : 'text-[#6E6E76]'}`}
                  >
                    {f === 'unpaid' ? 'Belum lunas' : 'Semua'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">No. Faktur / Dokumen</th>
                  <th className="py-3 px-3">Supplier</th>
                  <th className="py-3 px-3">Jatuh Tempo</th>
                  <th className="py-3 px-3 text-right">Total Faktur</th>
                  <th className="py-3 px-3 text-right">Sudah Dibayar</th>
                  <th className="py-3 px-3 text-right">Sisa Hutang</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {debtRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[#71717A]">
                      Tidak ada hutang yang belum lunas 🎉
                    </td>
                  </tr>
                )}
                {debtRows.map((pur) => {
                  const unpaid = outstandingOf(pur);
                  const isPaid = unpaid === 0;
                  const due = dueLabel(pur.due_date);

                  return (
                    <tr key={pur.id} className="hover:bg-[#F9FAFB]">
                      <td className="py-3.5 px-3 font-mono">
                        <p className="font-semibold text-xs text-[#111113]">{pur.invoice_no || '(tanpa no. faktur)'}</p>
                        <p className="text-[11px] text-[#71717A]">{pur.number}</p>
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-[#111113]">
                        {pur.supplier_name}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-mono text-xs text-[#111113]">{pur.due_date || '—'}</span>
                        {!isPaid && pur.due_date && (
                          <div
                            className={`text-[10px] font-semibold ${
                              due.tone === 'late' ? 'text-[#DC2626]' : due.tone === 'soon' ? 'text-[#D97706]' : 'text-[#71717A]'
                            }`}
                          >
                            {due.text}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-medium text-[#5B5B63] num">
                        {formatRupiah(pur.total)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-[#16A34A] num">
                        {formatRupiah(pur.paid_amount)}
                        {pur.returned_amount > 0 && (
                          <div className="text-[10px] text-[#D97706]">retur -{formatRupiah(pur.returned_amount)}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-[#111113] num">
                        {formatRupiah(unpaid)}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            isPaid
                              ? 'bg-[#DCFCE7] text-[#15803D]'
                              : pur.paid_amount > 0
                              ? 'bg-[#FEF3C7] text-[#92400E]'
                              : 'bg-[#FEE2E2] text-[#B91C1C]'
                          }`}
                        >
                          {isPaid ? 'Lunas' : pur.paid_amount + pur.returned_amount > 0 ? 'Sebagian' : 'Tempo'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {!isPaid && (
                          <button
                            onClick={() => {
                              setPayingPurchase(pur);
                              setPayAmount(unpaid);
                            }}
                            className="px-3 py-1.5 rounded-[10px] bg-[#D4FF3F] text-[#111113] hover:bg-[#c2ed2e] font-semibold text-xs transition-colors shadow-xs"
                          >
                            Bayar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DAFTAR SUPPLIER */}
      {tab === 'suppliers' && (
        <div className="panel p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-4 border-b border-[#E4E4E7]">
            <div>
              <h3 className="text-lg font-semibold text-[#111113]">Daftar Supplier Resmi & Distributor</h3>
              <p className="text-xs text-[#5B5B63]">Kontak, termin pembayaran tempo, dan alamat gudang supplier</p>
            </div>
            <button
              onClick={() => openSupplierModal()}
              className="px-4 py-2.5 rounded-[12px] bg-[#111113] text-white hover:bg-[#27272A] text-xs font-semibold flex items-center gap-2"
            >
              <Plus size={15} />
              <span>Tambah Supplier</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {suppliers.map((sup) => (
              <div
                key={sup.id}
                className="p-5 rounded-[18px] bg-[#F4F4F5] border border-[#E4E4E7] flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-[#71717A] uppercase">Supplier</span>
                    <span className="px-2 py-0.5 rounded-[6px] bg-white text-[#111113] text-[10px] font-bold num">
                      {sup.default_term_days} hari tempo
                    </span>
                  </div>
                  <h4 className="font-semibold text-sm text-[#111113]">{sup.name}</h4>
                  <p className="text-xs text-[#5B5B63] mt-2 font-mono">WA: {sup.phone}</p>
                  <p className="text-xs text-[#71717A] mt-1 line-clamp-2">{sup.address}</p>
                  {sup.note && (
                    <p className="text-[11px] text-[#6E6E76] mt-2 italic border-t border-[#E4E4E7] pt-2">
                      {sup.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#E4E4E7]">
                  <span className={`text-[11px] font-semibold num ${outstandingBySupplier[sup.id] ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
                    {outstandingBySupplier[sup.id] ? `Hutang ${formatRupiah(outstandingBySupplier[sup.id])}` : 'Tidak ada hutang'}
                  </span>
                  <button
                    onClick={() => openSupplierModal(sup)}
                    className="px-2.5 py-1 rounded-[8px] bg-white text-[#111113] text-[11px] font-semibold hover:bg-[#E4E4E7]"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: RIWAYAT PEMBELIAN & RETUR */}
      {tab === 'history' && (
        <div className="panel p-6 flex flex-col gap-4">
          <div className="pb-4 border-b border-[#E4E4E7]">
            <h3 className="text-lg font-semibold text-[#111113]">Riwayat Pembelian & Retur ke Supplier</h3>
            <p className="text-xs text-[#5B5B63]">
              Retur memotong sisa hutang faktur tersebut; jika faktur sudah lunas, nilainya dicatat sebagai refund dari supplier.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Dokumen</th>
                  <th className="py-3 px-3">Tanggal</th>
                  <th className="py-3 px-3">Supplier</th>
                  <th className="py-3 px-3">Barang</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {purchases.map((pur) => {
                  const rets = purchaseReturns.filter((r) => r.purchase_id === pur.id);
                  return (
                    <tr key={pur.id} className="hover:bg-[#F9FAFB] align-top">
                      <td className="py-3 px-3 font-mono">
                        <div className="font-semibold text-[#111113]">{pur.number}</div>
                        <div className="text-[11px] text-[#71717A]">{pur.invoice_no}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#5B5B63]">{formatDateTimeIndo(pur.created_at)}</td>
                      <td className="py-3 px-3 font-semibold">{pur.supplier_name}</td>
                      <td className="py-3 px-3 text-[#5B5B63]">
                        {pur.items.map((i, k) => (
                          <div key={k}>
                            {i.product_name} × {i.qty} @ {formatRupiah(i.cost)}
                          </div>
                        ))}
                        {rets.map((r) => (
                          <div key={r.id} className="text-[#D97706] font-medium mt-1">
                            {r.number}: retur {r.items.map((i) => `${i.product_name} × ${i.qty}`).join(', ')} ({formatRupiah(r.total)}
                            {r.debt_cut > 0 && `, potong hutang ${formatRupiah(r.debt_cut)}`}
                            {r.refund_amount > 0 && `, refund ${formatRupiah(r.refund_amount)}`})
                          </div>
                        ))}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold num">{formatRupiah(pur.total)}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setReturningPurchase(pur)}
                          className="px-3 py-1.5 rounded-[10px] bg-[#F4F4F5] hover:bg-[#E4E4E7] font-semibold inline-flex items-center gap-1.5"
                        >
                          <Undo2 size={13} /> Retur
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {returningPurchase && (
        <PurchaseReturnModal
          purchase={returningPurchase}
          products={products}
          returns={purchaseReturns.filter((r) => r.purchase_id === returningPurchase.id)}
          onClose={() => setReturningPurchase(null)}
          onConfirm={async (params) => {
            if (await onReturnPurchase(returningPurchase.id, params)) setReturningPurchase(null);
          }}
        />
      )}

      {/* Pay Debt Modal */}
      {payingPurchase && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 text-xs animate-in fade-in zoom-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7]">
              <div>
                <h3 className="text-base font-semibold text-[#111113]">Catat Pembayaran Hutang</h3>
                <p className="text-[11px] text-[#6E6E76]">{payingPurchase.supplier_name}</p>
              </div>
              <button
                onClick={() => setPayingPurchase(null)}
                className="p-1 rounded-full hover:bg-[#F4F4F5] text-[#71717A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 rounded-[14px] bg-[#F4F4F5] flex justify-between items-center font-mono">
              <div>
                <p className="text-[11px] text-[#71717A]">No. Faktur: {payingPurchase.invoice_no || payingPurchase.number}</p>
                <p className="text-xs font-semibold text-[#111113]">Sisa Hutang</p>
              </div>
              <div className="text-lg font-bold text-[#DC2626] num">
                {formatRupiah(outstandingOf(payingPurchase))}
              </div>
            </div>

            <div>
              <label className="font-semibold text-[#111113] block mb-1">Nominal Pembayaran (Rp)</label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-mono font-bold text-sm text-[#111113] outline-none"
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setPayAmount(outstandingOf(payingPurchase))}
                  className="px-2.5 py-1 rounded bg-[#E4E4E7] text-[11px] font-semibold"
                >
                  Bayar Lunas Penuh
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E4E4E7]">
              <button
                type="button"
                onClick={() => setPayingPurchase(null)}
                className="px-4 py-2 rounded-[10px] text-xs font-semibold text-[#5B5B63] hover:bg-[#F4F4F5]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (payAmount <= 0) return alert('Nominal pembayaran harus lebih dari 0');
                  if (payAmount > outstandingOf(payingPurchase)) return alert('Nominal melebihi sisa hutang');
                  if (await onPayDebt(payingPurchase.id, payAmount)) setPayingPurchase(null);
                }}
                className="px-5 py-2 rounded-[10px] bg-[#111113] text-white text-xs font-semibold hover:bg-[#27272A]"
              >
                Konfirmasi Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7]">
              <h3 className="text-base font-semibold text-[#111113]">
                {isEditingSupplier ? 'Edit Supplier' : 'Tambah Supplier Baru'}
              </h3>
              <button
                onClick={() => setIsSupplierModalOpen(false)}
                className="p-1 rounded-full hover:bg-[#F4F4F5] text-[#71717A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-semibold block mb-1">Nama Supplier / PT</label>
                <input
                  type="text"
                  required
                  placeholder="misal: PT Daya Adicipta Motora"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-medium outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">No. WhatsApp / Telepon</label>
                <input
                  type="text"
                  placeholder="0812-xxxx-xxxx"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Termin Default (Hari, 0 = tunai)</label>
                <input
                  type="number"
                  min={0}
                  value={newSupplier.default_term_days}
                  onChange={(e) =>
                    setNewSupplier({
                      ...newSupplier,
                      default_term_days: Math.max(0, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Alamat Gudang</label>
                <input
                  type="text"
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Catatan</label>
                <input
                  type="text"
                  placeholder="misal: sales datang tiap Senin"
                  value={newSupplier.note || ''}
                  onChange={(e) => setNewSupplier({ ...newSupplier, note: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E4E4E7]">
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="px-4 py-2 rounded-[10px] text-[#5B5B63] hover:bg-[#F4F4F5]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!newSupplier.name.trim()) {
                    alert('Nama supplier wajib diisi');
                    return;
                  }
                  if (await onSaveSupplier(newSupplier)) setIsSupplierModalOpen(false);
                }}
                className="px-5 py-2 rounded-[10px] bg-[#111113] text-white font-semibold"
              >
                Simpan Supplier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PurchaseReturnModal({
  purchase,
  products,
  returns,
  onClose,
  onConfirm,
}: {
  purchase: Purchase;
  products: Product[];
  returns: PurchaseReturn[];
  onClose: () => void;
  onConfirm: (p: { reason: string; items: Array<{ product_id: string; qty: number }> }) => Promise<void>;
}) {
  // Gabungkan baris faktur per produk
  const lines = Object.values(
    purchase.items.reduce<Record<string, { product_id: string; product_name: string; qty: number; value: number }>>((acc, i) => {
      const l = (acc[i.product_id] ||= { product_id: i.product_id, product_name: i.product_name, qty: 0, value: 0 });
      l.qty += i.qty;
      l.value += i.qty * i.cost;
      return acc;
    }, {})
  );
  const returnedOf = (pid: string) => returns.reduce((s, r) => s + r.items.filter((i) => i.product_id === pid).reduce((a, i) => a + i.qty, 0), 0);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((s, l) => s + (qtys[l.product_id] || 0) * Math.round(l.value / l.qty), 0);
  const outstanding = outstandingOf(purchase);
  const debtCut = Math.min(total, outstanding);
  const items = Object.entries(qtys)
    .filter(([, q]) => q > 0)
    .map(([product_id, qty]) => ({ product_id, qty }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[20px] w-full max-w-lg max-h-[92vh] flex flex-col text-xs overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#E4E4E7]">
          <h3 className="font-semibold text-base text-[#111113]">Retur ke {purchase.supplier_name}</h3>
          <p className="text-[#6E6E76]">
            {purchase.number} · sisa hutang faktur {formatRupiah(outstanding)}
          </p>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-3">
          {lines.map((l) => {
            const unitCost = Math.round(l.value / l.qty);
            const stock = products.find((p) => p.id === l.product_id)?.stock_qty ?? 0;
            const max = Math.max(0, Math.min(l.qty - returnedOf(l.product_id), stock));
            const q = qtys[l.product_id] || 0;
            return (
              <div key={l.product_id} className={`p-3 rounded-[12px] border flex justify-between gap-2 ${q > 0 ? 'border-[#111113]' : 'border-[#E4E4E7]'}`}>
                <div>
                  <div className="font-semibold text-[#111113]">{l.product_name}</div>
                  <div className="text-[#71717A]">
                    Dibeli {l.qty} @ {formatRupiah(unitCost)} · sudah retur {returnedOf(l.product_id)} · stok {stock}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button disabled={q <= 0} onClick={() => setQtys({ ...qtys, [l.product_id]: q - 1 })} className="w-7 h-7 rounded-[8px] bg-[#F4F4F5] font-bold disabled:opacity-30">
                    −
                  </button>
                  <span className="w-6 text-center font-mono font-bold">{q}</span>
                  <button disabled={q >= max} onClick={() => setQtys({ ...qtys, [l.product_id]: q + 1 })} className="w-7 h-7 rounded-[8px] bg-[#F4F4F5] font-bold disabled:opacity-30">
                    +
                  </button>
                </div>
              </div>
            );
          })}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan retur (wajib), mis. cacat pabrik / salah kirim"
            className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none"
          />
        </div>
        <div className="p-4 border-t border-[#E4E4E7] flex items-center justify-between bg-[#F9FAFB]">
          <div>
            <div className="font-bold text-lg num">{formatRupiah(total)}</div>
            <div className="text-[#6E6E76]">
              {total > 0 && (debtCut > 0 ? `Potong hutang ${formatRupiah(debtCut)}` : '')}
              {total - debtCut > 0 && `${debtCut > 0 ? ' + ' : ''}refund ${formatRupiah(total - debtCut)}`}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-[10px] text-[#5B5B63] hover:bg-[#F4F4F5] font-semibold">
              Batal
            </button>
            <button
              disabled={!items.length || !reason.trim() || busy}
              onClick={async () => {
                setBusy(true);
                await onConfirm({ reason: reason.trim(), items });
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
