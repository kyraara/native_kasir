import React, { useEffect, useState } from 'react';
import { ShoppingBag, Truck, ArrowUpRight, ArrowDownRight, ChevronRight, TrendingUp, CreditCard, Package, Loader2 } from 'lucide-react';
import { Product, StoreSettings } from '../../types';
import { formatRupiah, calculateInventoryValue, formatDateIndo } from '../../utils/pricing';
import { fetchDashboard, DashboardData } from '../../utils/api';
import { dueLabel } from './PurchasesView';

interface DashboardViewProps {
  products: Product[];
  settings: StoreSettings;
  /** Berubah setiap data dimuat ulang → dashboard ikut diperbarui */
  dataVersion: number;
  onOpenKasir: () => void;
  onNavigateTab: (tab: string) => void;
  onOpenQuickReceive: () => void;
}

const RANGES = { '7h': 7, '30h': 30, '90h': 90 } as const;

function changePct(today: number, yesterday: number): number | null {
  if (!yesterday) return null;
  return ((today - yesterday) / yesterday) * 100;
}

export function DashboardView({ products, settings, dataVersion, onOpenKasir, onNavigateTab, onOpenQuickReceive }: DashboardViewProps) {
  const [chartRange, setChartRange] = useState<keyof typeof RANGES>('30h');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err?.message || 'Gagal memuat dashboard'));
  }, [dataVersion]);

  const active = products.filter((p) => p.is_active);
  const inventoryValue = calculateInventoryValue(active);
  const outOfStock = active.filter((p) => p.stock_qty <= 0);
  const lowStock = active.filter((p) => p.stock_qty > 0 && p.stock_qty <= p.min_stock);

  const t = data?.today_summary;
  const y = data?.yesterday_summary;
  const change = t && y ? changePct(t.net_sales, y.net_sales) : null;

  // Grafik penjualan bersih per hari
  const series = data ? data.daily.slice(-RANGES[chartRange]) : [];
  const values = series.map((d) => Math.max(0, d.net_sales));
  const maxVal = Math.max(1, ...values);
  const W = 600;
  const H = 120;
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W / 2, H - (v / maxVal) * (H - 12)] as const);
  const lineD = pts.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
  const areaD = pts.length ? `M0,${H} ${pts.map(([x, yy]) => `L${x.toFixed(1)},${yy.toFixed(1)}`).join(' ')} L${W},${H} Z` : '';
  const rangeTotal = series.reduce((a, d) => a + d.net_sales, 0);

  const maxTop = Math.max(1, ...(data?.top_products.map((p) => p.qty) || [1]));
  const dueTotal = data?.due_debts.reduce((a, d) => a + d.outstanding, 0) || 0;

  return (
    <div className="flex flex-col gap-3 pb-8">
      <div className="panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-[#6E6E76] mb-0.5">
            {new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#111113]">{settings.name}</h2>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onOpenQuickReceive}
            className="px-4 py-2.5 rounded-[14px] bg-[#FFFFFF] border border-[#E4E4E7] text-[#111113] hover:bg-[#F4F4F5] text-xs font-semibold flex items-center gap-2 shadow-sm"
          >
            <Truck size={15} /> Terima Barang
          </button>
          <button
            onClick={onOpenKasir}
            className="px-5 py-2.5 rounded-[14px] bg-[#111113] text-white hover:bg-[#27272A] text-xs font-semibold flex items-center gap-2 shadow-md"
          >
            <span className="w-2 h-2 rounded-full bg-[#D4FF3F] shrink-0 animate-pulse" />
            Buka Kasir
            <kbd className="ml-1 text-[10px] font-mono bg-[#2A2A2E] text-[#A1A1AA] px-1.5 py-0.5 rounded">F1</kbd>
          </button>
        </div>
      </div>

      {error && <div className="panel p-4 text-xs text-[#B91C1C] bg-[#FEE2E2]">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 panel p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#5B5B63]">Penjualan Hari Ini</span>
                {change !== null && (
                  <span
                    title="Dibanding kemarin"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-bold num ${
                      change >= 0 ? 'bg-[#111113] text-[#D4FF3F]' : 'bg-[#FEE2E2] text-[#B91C1C]'
                    }`}
                  >
                    {change >= 0 ? <ArrowUpRight size={13} strokeWidth={2.5} /> : <ArrowDownRight size={13} strokeWidth={2.5} />}
                    {change >= 0 ? '+' : ''}
                    {change.toFixed(1)}% vs kemarin
                  </span>
                )}
              </div>
              <div className="text-3xl md:text-4xl font-medium tracking-tight text-[#111113] mt-2 num">
                {t ? formatRupiah(t.net_sales) : <Loader2 size={24} className="animate-spin text-[#A1A1AA]" />}
              </div>
              {t && t.refunds > 0 && <div className="text-[11px] text-[#DC2626] mt-0.5">sudah dikurangi retur {formatRupiah(t.refunds)}</div>}
            </div>
            <div className="flex items-center p-1 rounded-[10px] bg-[#F4F4F5] border border-[#E4E4E7] text-xs font-medium">
              {(Object.keys(RANGES) as Array<keyof typeof RANGES>).map((r) => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={`px-2.5 py-1 rounded-[8px] ${chartRange === r ? 'bg-white text-[#111113] font-semibold shadow-xs' : 'text-[#6E6E76]'}`}
                >
                  {RANGES[r]} hari
                </button>
              ))}
            </div>
          </div>

          <div className="w-full mt-6 pt-2">
            {series.length > 0 && (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="limeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D4FF3F" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#D4FF3F" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={areaD} fill="url(#limeFill)" />
                <path d={lineD} fill="none" stroke="#111113" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            <div className="flex justify-between items-center text-[11px] text-[#6E6E76] mt-2 font-mono">
              <span>{series[0] ? formatDateIndo(series[0].date) : ''}</span>
              <span>Total {RANGES[chartRange]} hari: {formatRupiah(rangeTotal)}</span>
              <span>Hari ini</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="panel p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#5B5B63]">Laba Kotor Hari Ini</p>
              <h3 className="text-xl md:text-2xl font-medium tracking-tight text-[#111113] mt-1 num">{t ? formatRupiah(t.gross_profit) : '…'}</h3>
              <p className="text-[11px] text-[#6E6E76] mt-0.5">
                {t && t.net_sales > 0 ? `Margin ${((t.gross_profit / t.net_sales) * 100).toFixed(1)}%` : 'Belum ada penjualan'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#F4F4F5] flex items-center justify-center text-[#111113]">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="panel p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#5B5B63]">Transaksi Hari Ini</p>
              <h3 className="text-xl md:text-2xl font-medium tracking-tight text-[#111113] mt-1 num">
                {t ? t.tx_count : '…'} <span className="text-sm font-normal text-[#6E6E76]">struk</span>
              </h3>
              <p className="text-[11px] text-[#6E6E76] mt-0.5">Kemarin: {y ? `${y.tx_count} struk` : '…'}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#F4F4F5] flex items-center justify-center text-[#111113]">
              <ShoppingBag size={20} />
            </div>
          </div>
          <div className="panel p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#5B5B63]">Nilai Persediaan</p>
              <h3 className="text-xl md:text-2xl font-medium tracking-tight text-[#111113] mt-1 num">{formatRupiah(inventoryValue)}</h3>
              <p className="text-[11px] text-[#6E6E76] mt-0.5">{active.length} SKU aktif (harga pokok)</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#F4F4F5] flex items-center justify-center text-[#111113]">
              <Package size={20} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="panel p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-[#111113]">Perlu Perhatian</h4>
              <button onClick={() => onNavigateTab('restock')} className="text-xs text-[#5B5B63] hover:text-[#111113] flex items-center gap-1 font-medium">
                Lihat semua <ChevronRight size={13} />
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => onNavigateTab('restock')}
                className="w-full flex items-center justify-between p-3 rounded-[14px] bg-[#FEE2E2]/60 hover:bg-[#FEE2E2] text-left"
              >
                <span className="flex items-center gap-2.5 text-xs font-semibold text-[#B91C1C]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" /> Stok Habis
                </span>
                <span className="text-sm font-bold text-[#B91C1C] num">{outOfStock.length} produk</span>
              </button>
              <button
                onClick={() => onNavigateTab('restock')}
                className="w-full flex items-center justify-between p-3 rounded-[14px] bg-[#FEF3C7]/60 hover:bg-[#FEF3C7] text-left"
              >
                <span className="flex items-center gap-2.5 text-xs font-semibold text-[#92400E]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" /> Stok Menipis
                </span>
                <span className="text-sm font-bold text-[#92400E] num">{lowStock.length} produk</span>
              </button>
              <button
                onClick={() => onNavigateTab('reports_movement')}
                className="w-full flex items-center justify-between p-3 rounded-[14px] bg-[#F4F4F5] hover:bg-[#E4E4E7] text-left"
              >
                <span className="flex items-center gap-2.5 text-xs font-medium text-[#5B5B63]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#71717A]" /> Dead Stock (&gt;{data?.dead_stock_days ?? 90} hari)
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold text-[#3F3F46] num">{data ? data.dead_stock_count : '…'} produk</span>
                  {data && data.dead_stock_value > 0 && <span className="block text-[10px] text-[#6E6E76]">modal {formatRupiah(data.dead_stock_value)}</span>}
                </span>
              </button>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('restock')}
            className="w-full mt-4 py-2.5 rounded-[12px] bg-[#111113] text-white hover:bg-[#27272A] text-xs font-semibold flex items-center justify-center gap-2"
          >
            Buka Daftar "Perlu Dibeli" <ChevronRight size={14} />
          </button>
        </div>

        <div className="panel p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-[#111113]">Terlaris 7 Hari</h4>
              <span className="text-[11px] text-[#6E6E76]">Unit terjual</span>
            </div>
            <div className="flex flex-col gap-3">
              {data && data.top_products.length === 0 && <p className="text-xs text-[#71717A]">Belum ada penjualan 7 hari terakhir.</p>}
              {data?.top_products.map((item, idx) => (
                <div key={item.product_id} className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="truncate pr-2 font-medium text-[#111113]">
                      {idx + 1}. {item.name}
                    </span>
                    <span className="shrink-0 font-mono text-[#5B5B63] num">{item.qty}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#F4F4F5] overflow-hidden">
                    <div className={`h-full rounded-full ${idx === 0 ? 'bg-[#111113]' : 'bg-[#A1A1AA]'}`} style={{ width: `${(item.qty / maxTop) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => onNavigateTab('reports')} className="w-full mt-4 py-2.5 rounded-[12px] bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#111113] text-xs font-semibold">
            Lihat Laporan Lengkap
          </button>
        </div>

        <div className="panel-ink p-6 flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-[#D4FF3F]" />
                <h4 className="text-base font-semibold text-white">Hutang Jatuh Tempo</h4>
              </div>
              {data && data.due_debts.length > 0 && (
                <span className="px-2 py-0.5 rounded-[6px] bg-[#2A2A2E] text-[#FBBF24] text-[11px] font-medium num">{data.due_debts.length} faktur</span>
              )}
            </div>
            <p className="text-xs text-[#A1A1AA]">Sisa hutang lewat tempo + jatuh tempo 7 hari ke depan:</p>
            <div className="text-2xl md:text-3xl font-medium text-[#D4FF3F] mt-1 mb-4 num">{formatRupiah(dueTotal)}</div>
            <div className="flex flex-col gap-2">
              {data && data.due_debts.length === 0 && <p className="text-xs text-[#A1A1AA]">Tidak ada hutang jatuh tempo minggu ini.</p>}
              {data?.due_debts.slice(0, 3).map((d) => {
                const due = dueLabel(d.due_date);
                return (
                  <div key={d.id} className="p-3 rounded-[14px] bg-[#1C1C1F] border border-[#2A2A2E] flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-white truncate">{d.supplier_name}</p>
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        {d.invoice_no || d.number} · {formatDateIndo(d.due_date)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-semibold text-white num">{formatRupiah(d.outstanding)}</p>
                      <span className={`text-[10px] ${due.tone === 'late' ? 'text-[#F87171]' : 'text-[#FBBF24]'}`}>{due.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('debts')}
            className="w-full mt-4 py-3 rounded-[14px] bg-[#D4FF3F] text-[#111113] hover:bg-[#c2ed2e] font-semibold text-xs flex items-center justify-center gap-2"
          >
            Catat Pembayaran Hutang <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
