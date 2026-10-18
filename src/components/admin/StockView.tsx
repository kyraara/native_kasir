import React, { useState, useEffect } from 'react';
import {
  Layers,
  TrendingUp,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Send,
  Package,
} from 'lucide-react';
import { Product, StockMovement, Supplier, CustomerRequest } from '../../types';
import type { ProductStat } from '../../utils/api';
import { StatusDot } from '../common/Badge';
import {
  formatRupiah,
  formatDateTimeIndo,
  calculateSuggestedRestock,
} from '../../utils/pricing';
import { EmptyState } from '../common/Brand';

interface StockViewProps {
  products: Product[];
  movements: StockMovement[];
  suppliers: Supplier[];
  productStats: ProductStat[];
  requests: CustomerRequest[];
  onUpdateRequest: (id: string, status: CustomerRequest['status']) => Promise<boolean>;
  activeSubTab?: 'card' | 'restock' | 'adjust';
  selectedProduct?: Product | null;
  onAdjustStock: (
    productId: string,
    newStock: number,
    reason: 'rusak' | 'hilang' | 'pemakaian_sendiri' | 'koreksi',
    note?: string
  ) => Promise<boolean>;
  onNavigateToPurchase: (product: Product, suggestedQty: number) => void;
}

const formatLastSold = (iso: string | null | undefined) => {
  if (!iso) return 'Belum pernah terjual';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days === 0 ? 'Terakhir terjual hari ini' : `Terakhir terjual ${days} hari lalu`;
};

export function StockView({
  products,
  movements,
  suppliers,
  productStats,
  requests,
  onUpdateRequest,
  activeSubTab = 'card',
  selectedProduct: initialSelectedProduct,
  onAdjustStock,
  onNavigateToPurchase,
}: StockViewProps) {
  const [tab, setTab] = useState<'card' | 'restock' | 'adjust'>(activeSubTab);
  // Ikuti menu sidebar (Stok & Kartu ↔ Perlu Dibeli) walau halaman sudah terbuka
  useEffect(() => setTab(activeSubTab), [activeSubTab]);
  useEffect(() => {
    if (initialSelectedProduct) setSelectedProductId(initialSelectedProduct.id);
  }, [initialSelectedProduct]);
  const statMap = new Map(productStats.map((s) => [s.product_id, s]));
  const [selectedProductId, setSelectedProductId] = useState<string>(
    initialSelectedProduct?.id || (products[0]?.id || '')
  );
  const [searchCardQuery, setSearchCardQuery] = useState('');

  // Manual Adjust form state
  const [adjustProductId, setAdjustProductId] = useState<string>(
    products[0]?.id || ''
  );
  const [adjustNewQty, setAdjustNewQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<
    'rusak' | 'hilang' | 'pemakaian_sendiri' | 'koreksi'
  >('koreksi');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustSuccessMsg, setAdjustSuccessMsg] = useState(false);

  // Selected product for stock card
  const activeProduct = products.find((p) => p.id === selectedProductId) || products[0];

  // Movements for active product
  const productMovements = movements.filter(
    (m) => m.product_id === activeProduct?.id
  );

  // Restock list (Habis & Menipis)
  // STK-04: produk aktif yang Menipis/Habis, urut dari yang paling laku
  const restockItems = products
    .filter((p) => p.is_active && p.stock_qty <= p.min_stock)
    .sort((a, b) => (statMap.get(b.id)?.sold_30d || 0) - (statMap.get(a.id)?.sold_30d || 0));

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustProductId) return;
    if (!(await onAdjustStock(adjustProductId, adjustNewQty, adjustReason, adjustNote))) return;
    setAdjustSuccessMsg(true);
    setAdjustNote('');
    setTimeout(() => setAdjustSuccessMsg(false), 3000);
  };

  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Top Header & Tab switcher */}
      <div className="panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#111113]">
            Manajemen & Monitoring Stok
          </h2>
          <p className="text-xs text-[#5B5B63] mt-0.5">
            Audit saldo berjalan kartu stok, daftar perlu dibeli, dan penyesuaian fisik
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center p-1 rounded-[12px] bg-[#F4F4F5] border border-[#E4E4E7] text-xs font-medium">
          <button
            onClick={() => setTab('card')}
            className={`px-3.5 py-1.5 rounded-[10px] transition-all flex items-center gap-1.5 ${
              tab === 'card'
                ? 'bg-white text-[#111113] font-semibold shadow-xs'
                : 'text-[#6E6E76] hover:text-[#111113]'
            }`}
          >
            <Layers size={14} />
            <span>Kartu Stok</span>
          </button>

          <button
            onClick={() => setTab('restock')}
            className={`px-3.5 py-1.5 rounded-[10px] transition-all flex items-center gap-1.5 ${
              tab === 'restock'
                ? 'bg-[#111113] text-[#D4FF3F] font-semibold shadow-xs'
                : 'text-[#6E6E76] hover:text-[#111113]'
            }`}
          >
            <TrendingUp size={14} />
            <span>Perlu Dibeli</span>
            {restockItems.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#D4FF3F] text-[#111113] text-[10px] font-bold flex items-center justify-center num">
                {restockItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('adjust')}
            className={`px-3.5 py-1.5 rounded-[10px] transition-all flex items-center gap-1.5 ${
              tab === 'adjust'
                ? 'bg-white text-[#111113] font-semibold shadow-xs'
                : 'text-[#6E6E76] hover:text-[#111113]'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>Penyesuaian Manual</span>
          </button>
        </div>
      </div>

      {/* TAB 1: KARTU STOK */}
      {tab === 'card' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Left: Product Selector */}
          <div className="lg:col-span-4 panel p-4 flex flex-col gap-3 max-h-[700px]">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
              <input
                type="text"
                placeholder="Cari part untuk cek kartu..."
                value={searchCardQuery}
                onChange={(e) => setSearchCardQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-[10px] bg-[#F4F4F5] text-xs font-medium outline-none focus:ring-1 focus:ring-[#111113]"
              />
            </div>

            <div className="overflow-y-auto flex flex-col gap-1 pr-1">
              {products
                .filter((p) =>
                  p.name.toLowerCase().includes(searchCardQuery.toLowerCase()) ||
                  p.part_number.toLowerCase().includes(searchCardQuery.toLowerCase()) ||
                  p.sku.toLowerCase().includes(searchCardQuery.toLowerCase())
                )
                .map((prod) => {
                  const isSelected = prod.id === selectedProductId;
                  const status =
                    prod.stock_qty <= 0
                      ? 'out'
                      : prod.stock_qty <= prod.min_stock
                      ? 'low'
                      : 'safe';

                  return (
                    <button
                      key={prod.id}
                      onClick={() => setSelectedProductId(prod.id)}
                      className={`p-3 rounded-[12px] text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#111113] text-white shadow-sm'
                          : 'bg-[#F4F4F5]/60 hover:bg-[#F4F4F5] text-[#111113]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className={`font-semibold text-xs truncate ${isSelected ? 'text-white' : 'text-[#111113]'}`}>
                          {prod.name}
                        </p>
                        <p className={`text-[11px] font-mono truncate mt-0.5 ${isSelected ? 'text-[#A1A1AA]' : 'text-[#71717A]'}`}>
                          {prod.part_number || prod.sku} · Rak: {prod.rack_location}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`font-mono text-xs font-bold ${isSelected ? 'text-[#D4FF3F]' : 'text-[#111113]'} num`}>
                          {prod.stock_qty} {prod.unit}
                        </span>
                        <div>
                          <StatusDot
                            status={status}
                            isDark={isSelected}
                            text={status === 'out' ? 'Habis' : status === 'low' ? 'Menipis' : 'Aman'}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Right: Stock Movements Table */}
          <div className="lg:col-span-8 panel p-6 flex flex-col justify-between">
            <div>
              {/* Product Header in Card */}
              {activeProduct && (
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#E4E4E7] gap-3">
                  <div>
                    <span className="text-[11px] font-mono text-[#71717A]">
                      SKU: {activeProduct.sku} · OEM: {activeProduct.part_number || '-'}
                    </span>
                    <h3 className="text-lg font-semibold text-[#111113]">{activeProduct.name}</h3>
                    <p className="text-xs text-[#5B5B63]">
                      Lokasi: Rak <span className="font-semibold text-[#111113]">{activeProduct.rack_location}</span> · HPP Rata-rata: <span className="font-mono font-semibold text-[#111113]">{formatRupiah(activeProduct.avg_cost)}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] text-[#5B5B63]">Saldo Stok Fisik</span>
                      <div className="text-2xl font-bold font-mono text-[#111113] num">
                        {activeProduct.stock_qty} <span className="text-xs font-normal text-[#6E6E76]">{activeProduct.unit}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Movement History */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Tanggal & Waktu</th>
                      <th className="py-2.5 px-3">Jenis Transaksi</th>
                      <th className="py-2.5 px-3">No. Dokumen / Ket</th>
                      <th className="py-2.5 px-3 text-right">Mutasi Qty</th>
                      <th className="py-2.5 px-3 text-right">Saldo Akhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F4F5]">
                    {productMovements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#71717A]">
                          Belum ada catatan mutasi stok untuk produk ini.
                        </td>
                      </tr>
                    ) : (
                      productMovements.map((mov) => {
                        const isIncrease = mov.qty_change > 0;
                        return (
                          <tr key={mov.id} className="hover:bg-[#F9FAFB]">
                            <td className="py-3 px-3 text-[#5B5B63] font-mono text-[11px]">
                              {formatDateTimeIndo(mov.created_at)}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  mov.type === 'purchase'
                                    ? 'bg-[#DCFCE7] text-[#15803D]'
                                    : mov.type === 'sale'
                                    ? 'bg-[#E0E7FF] text-[#4338CA]'
                                    : mov.type === 'void'
                                    ? 'bg-[#FEF3C7] text-[#92400E]'
                                    : 'bg-[#F4F4F5] text-[#3F3F46]'
                                }`}
                              >
                                {mov.type === 'purchase'
                                  ? 'Beli (Masuk)'
                                  : mov.type === 'sale'
                                  ? 'Jual (Keluar)'
                                  : mov.type === 'void'
                                  ? 'Batal Jual'
                                  : 'Penyesuaian'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-mono text-xs text-[#111113] font-semibold">
                                {mov.ref_number}
                              </p>
                              {mov.note && (
                                <p className="text-[11px] text-[#71717A] truncate max-w-xs">{mov.note}</p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold num">
                              <span
                                className={
                                  isIncrease ? 'text-[#16A34A]' : 'text-[#DC2626]'
                                }
                              >
                                {isIncrease ? `+${mov.qty_change}` : mov.qty_change}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-[#111113] num">
                              {mov.balance_after}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#E4E4E7] text-[11px] text-[#71717A] flex justify-between items-center">
              <span>* Semua pergerakan stok tercatat otomatis dari kasir, pembelian, dan penyesuaian.</span>
              <button
                onClick={() => {
                  setAdjustProductId(activeProduct.id);
                  setAdjustNewQty(activeProduct.stock_qty);
                  setTab('adjust');
                }}
                className="text-[#111113] font-semibold hover:underline flex items-center gap-1"
              >
                Koreksi Fisik Produk Ini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PERLU DIBELI */}
      {tab === 'restock' && (
        <div className="panel p-6 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-[#E4E4E7]">
            <div>
              <h3 className="text-lg font-semibold text-[#111113]">
                Daftar Produk Perlu Dibeli (Restock)
              </h3>
              <p className="text-xs text-[#5B5B63]">
                Produk habis atau di bawah stok minimum. Saran beli = cukup untuk penjualan 30 hari ke depan (berdasarkan penjualan 30 hari terakhir), minimal 2× stok minimum.
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-[10px] bg-[#111113] text-[#D4FF3F] num">
              {restockItems.length} produk butuh restock
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Produk</th>
                  <th className="py-3 px-3">Nomor Part / Rak</th>
                  <th className="py-3 px-3 text-center">Stok Fisik</th>
                  <th className="py-3 px-3 text-center">Stok Min</th>
                  <th className="py-3 px-3 text-center">Terjual 30 hr</th>
                  <th className="py-3 px-3 text-center">Saran Beli</th>
                  <th className="py-3 px-3 text-right">Est. Modal</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {restockItems.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState mascot="sukses" title="Semua stok aman" description="Tidak ada produk yang habis atau di bawah stok minimum." />
                    </td>
                  </tr>
                ) : (
                  restockItems.map((item) => {
                    const stat = statMap.get(item.id);
                    const suggestedQty = calculateSuggestedRestock(item.stock_qty, item.min_stock, stat?.sold_30d || 0);
                    const estCost = suggestedQty * item.avg_cost;

                    return (
                      <tr key={item.id} className="hover:bg-[#F9FAFB]">
                        <td className="py-3.5 px-3">
                          <p className="font-semibold text-xs text-[#111113]">{item.name}</p>
                          <p className="text-[11px] text-[#6E6E76]">{item.brand}</p>
                        </td>
                        <td className="py-3.5 px-3 font-mono">
                          <p className="text-xs text-[#111113]">{item.part_number || '-'}</p>
                          <p className="text-[11px] text-[#71717A]">Rak: {item.rack_location}</p>
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-mono font-bold num ${
                              item.stock_qty <= 0
                                ? 'bg-[#FEE2E2] text-[#DC2626]'
                                : 'bg-[#FEF3C7] text-[#D97706]'
                            }`}
                          >
                            {item.stock_qty} {item.unit}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono text-[#5B5B63] num">
                          {item.min_stock} {item.unit}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <span className="font-mono font-semibold text-[#111113] num">{stat?.sold_30d || 0}</span>
                          <div className="text-[10px] text-[#71717A]">{formatLastSold(stat?.last_sold_at)}</div>
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <span className="px-2.5 py-1 rounded-[8px] bg-[#111113] text-[#D4FF3F] font-mono font-bold text-xs num">
                            +{suggestedQty} {item.unit}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-semibold text-[#111113] num">
                          {formatRupiah(estCost)}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button
                            onClick={() => onNavigateToPurchase(item, suggestedQty)}
                            className="px-3 py-1.5 rounded-[10px] bg-[#111113] hover:bg-[#27272A] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                          >
                            <span>Terima / Beli</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI-05: barang yang dicari pelanggan tapi tidak ada / habis */}
      {tab === 'restock' && (
        <div className="panel p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#111113]">Dicari Pelanggan</h3>
              <p className="text-xs text-[#5B5B63]">Dicatat dari kasir saat barang tidak ditemukan atau stok habis.</p>
            </div>
            <span className="text-xs text-[#6E6E76]">{requests.filter((r) => r.status !== 'done').length} belum selesai</span>
          </div>
          {requests.filter((r) => r.status !== 'done').length === 0 && <p className="text-xs text-[#71717A]">Belum ada permintaan pelanggan.</p>}
          {requests
            .filter((r) => r.status !== 'done')
            .map((r) => (
              <div key={r.id} className="flex gap-3 items-center p-3 rounded-[14px] bg-[#F4F4F5] text-xs">
                {r.photo_url && <img src={r.photo_url} alt="" className="w-12 h-12 rounded-[10px] object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[#111113]">{r.description}</div>
                  <div className="text-[11px] text-[#6E6E76]">
                    {formatDateTimeIndo(r.created_at)}
                    {r.customer_phone && ` · ${r.customer_phone}`}
                    {r.status === 'ordered' && <span className="ml-1.5 font-semibold text-[#0369A1]">· sudah dipesan ke supplier</span>}
                  </div>
                </div>
                {r.status === 'open' && (
                  <button onClick={() => onUpdateRequest(r.id, 'ordered')} className="px-2.5 py-1.5 rounded-[8px] bg-white font-semibold shrink-0">
                    Sudah dipesan
                  </button>
                )}
                <button onClick={() => onUpdateRequest(r.id, 'done')} className="px-2.5 py-1.5 rounded-[8px] bg-[#111113] text-white font-semibold shrink-0">
                  Selesai
                </button>
              </div>
            ))}
        </div>
      )}

      {/* TAB 3: PENYESUAIAN MANUAL */}
      {tab === 'adjust' && (
        <div className="panel p-6 max-w-xl mx-auto w-full">
          <h3 className="text-lg font-semibold text-[#111113]">Penyesuaian Stok Fisik Manual</h3>
          <p className="text-xs text-[#5B5B63] mt-1 mb-5">
            Wajib sertakan alasan operasional saat mengubah stok secara manual tanpa nota faktur.
          </p>

          {adjustSuccessMsg && (
            <div className="mb-4 p-3 rounded-[12px] bg-[#DCFCE7] text-[#15803D] text-xs font-semibold flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              <span>Penyesuaian stok berhasil disimpan dan dicatat ke Kartu Stok!</span>
            </div>
          )}

          <form onSubmit={handleApplyAdjustment} className="flex flex-col gap-4 text-xs">
            <div>
              <label className="font-semibold text-[#111113] block mb-1">Pilih Produk</label>
              <select
                value={adjustProductId}
                onChange={(e) => {
                  setAdjustProductId(e.target.value);
                  const p = products.find((prod) => prod.id === e.target.value);
                  if (p) setAdjustNewQty(p.stock_qty);
                }}
                className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-medium text-[#111113] outline-none"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Stok sistem: {p.stock_qty} {p.unit} · Rak {p.rack_location})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#111113] block mb-1">Stok Fisik Baru</label>
                <input
                  type="number"
                  required
                  value={adjustNewQty}
                  onChange={(e) => setAdjustNewQty(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-mono font-bold text-sm text-[#111113] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111113] block mb-1">Alasan Wajib</label>
                <select
                  value={adjustReason}
                  onChange={(e) =>
                    setAdjustReason(e.target.value as any)
                  }
                  className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-medium text-[#111113] outline-none"
                >
                  <option value="koreksi">Koreksi Hitungan / Salah Catat</option>
                  <option value="rusak">Barang Rusak / Cacat Pabrik</option>
                  <option value="hilang">Barang Hilang / Selisih Gudang</option>
                  <option value="pemakaian_sendiri">Pemakaian Sendiri / Servis</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-[#111113] block mb-1">Catatan Tambahan (Opsional)</label>
              <input
                type="text"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="misal: Kemasan basah saat hujan atau hitung ulang rak A-01"
                className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] text-[#111113] outline-none"
              />
            </div>

            <button
              type="submit"
              className="mt-2 py-3 rounded-[14px] bg-[#111113] text-white hover:bg-[#27272A] font-semibold text-xs transition-colors"
            >
              Simpan Penyesuaian & Update Saldo
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
