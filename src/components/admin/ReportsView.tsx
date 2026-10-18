import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Files, Loader2, Plus, Trash2, RefreshCw } from 'lucide-react';
import type { StoreSettings } from '../../types';
import { formatRupiah, formatDateIndo } from '../../utils/pricing';
import * as api from '../../utils/api';
import type { PeriodReport, SnapshotReport } from '../../utils/api';
import { exportReportPdf, exportReportCsv, ReportDoc, ReportTable } from '../../utils/reportExport';
import {
  pct,
  summaryDoc,
  salesDoc,
  purchasesDoc,
  debtsDoc,
  inventoryDoc,
  movementDoc,
  cashDoc,
  expensesDoc,
} from '../../utils/reportDocs';

export type ReportTab = 'summary' | 'sales' | 'purchases' | 'debts' | 'inventory' | 'movement' | 'cash' | 'expenses';

interface ReportsViewProps {
  settings: StoreSettings;
  initialTab?: ReportTab;
  /** Dipanggil setelah biaya ditambah/dihapus */
  onChanged?: () => void;
}

const TABS: Array<[ReportTab, string]> = [
  ['summary', 'Laba Rugi'],
  ['sales', 'Penjualan'],
  ['purchases', 'Pembelian'],
  ['debts', 'Hutang'],
  ['inventory', 'Persediaan'],
  ['movement', 'Pergerakan Barang'],
  ['cash', 'Arus Kas'],
  ['expenses', 'Biaya Operasional'],
];

const EXPENSE_CATEGORIES = ['Sewa', 'Listrik & Air', 'Gaji', 'Plastik & Perlengkapan', 'Transport', 'Konsumsi', 'Internet & Pulsa', 'Lain-lain'];

const dk = (d: Date) => d.toLocaleDateString('en-CA');

function presetRange(p: string): [string, string] {
  const now = new Date();
  const today = dk(now);
  const ago = (days: number) => dk(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  switch (p) {
    case 'today':
      return [today, today];
    case 'yesterday':
      return [ago(1), ago(1)];
    case '7d':
      return [ago(6), today];
    case 'month':
      return [dk(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    case 'lastmonth':
      return [dk(new Date(now.getFullYear(), now.getMonth() - 1, 1)), dk(new Date(now.getFullYear(), now.getMonth(), 0))];
    default:
      return [ago(29), today];
  }
}

// ---------- Komponen ----------

function TableView({ t }: { t: ReportTable }) {
  const numeric = new Set(t.numericCols ?? t.head.map((_, i) => i).filter((i) => t.rows.some((r) => typeof r[i] === 'number')));
  const fmt = (v: string | number) => (typeof v === 'number' ? formatRupiah(v, false) : v);
  return (
    <div className="panel overflow-hidden">
      <div className="px-5 pt-4 pb-2 font-semibold text-sm text-[#111113]">{t.title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase tracking-wider">
            <tr>
              {t.head.map((h, i) => (
                <th key={i} className={`py-2.5 px-3 ${numeric.has(i) ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F4F4F5]">
            {t.rows.length === 0 && (
              <tr>
                <td colSpan={t.head.length} className="py-8 text-center text-[#71717A]">
                  Tidak ada data
                </td>
              </tr>
            )}
            {t.rows.map((r, ri) => (
              <tr key={ri} className="hover:bg-[#F9FAFB]">
                {r.map((c, ci) => (
                  <td key={ci} className={`py-2 px-3 ${numeric.has(ci) ? 'text-right font-mono num' : ''} ${ci === 0 ? 'font-medium text-[#111113]' : 'text-[#3F3F46]'}`}>
                    {fmt(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {t.foot && (
            <tfoot className="bg-[#F4F4F5] font-bold text-[#111113]">
              <tr>
                {t.foot.map((c, i) => (
                  <td key={i} className={`py-2.5 px-3 ${numeric.has(i) ? 'text-right font-mono num' : ''}`}>
                    {fmt(c)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {t.note && <p className="px-5 py-3 text-[11px] text-[#6E6E76] border-t border-[#F4F4F5]">{t.note}</p>}
    </div>
  );
}

function DailyChart({ daily }: { daily: PeriodReport['daily'] }) {
  if (daily.length < 2) return null;
  const max = Math.max(1, ...daily.map((d) => d.net_sales));
  return (
    <div className="panel p-5">
      <div className="flex justify-between items-center mb-3">
        <span className="font-semibold text-sm text-[#111113]">Penjualan bersih & laba kotor per hari</span>
        <span className="text-[11px] text-[#6E6E76] flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#111113]" /> Penjualan
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#D4FF3F] border border-[#A3C21F]" /> Laba
          </span>
        </span>
      </div>
      <div className="flex items-end gap-[3px] h-36">
        {daily.map((d) => (
          <div
            key={d.date}
            className="flex-1 h-full flex flex-col justify-end relative group min-w-0"
            title={`${formatDateIndo(d.date)}\nPenjualan ${formatRupiah(d.net_sales)}\nLaba ${formatRupiah(d.gross_profit)}`}
          >
            <div className="w-full bg-[#111113] rounded-t-[3px] relative" style={{ height: `${(Math.max(0, d.net_sales) / max) * 100}%` }}>
              <div
                className="absolute bottom-0 left-0 right-0 bg-[#D4FF3F] rounded-t-[3px]"
                style={{ height: d.net_sales > 0 ? `${(Math.max(0, d.gross_profit) / d.net_sales) * 100}%` : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-[#6E6E76] font-mono mt-1.5">
        <span>{formatDateIndo(daily[0].date)}</span>
        <span>{formatDateIndo(daily[daily.length - 1].date)}</span>
      </div>
    </div>
  );
}

export function ReportsView({ settings, initialTab = 'summary', onChanged }: ReportsViewProps) {
  const [tab, setTab] = useState<ReportTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState<[string, string]>(() => presetRange('month'));
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, s] = await Promise.all([api.fetchPeriodReport(range[0], range[1]), api.fetchSnapshotReport()]);
      setReport(r);
      setSnapshot(s);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat laporan');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const docFor = useCallback(
    (t: ReportTab): ReportDoc | null => {
      if (['debts', 'inventory', 'movement'].includes(t)) {
        if (!snapshot) return null;
        return t === 'debts' ? debtsDoc(snapshot) : t === 'inventory' ? inventoryDoc(snapshot) : movementDoc(snapshot);
      }
      if (!report) return null;
      switch (t) {
        case 'summary':
          return summaryDoc(report);
        case 'sales':
          return salesDoc(report);
        case 'purchases':
          return purchasesDoc(report);
        case 'cash':
          return cashDoc(report);
        default:
          return expensesDoc(report);
      }
    },
    [report, snapshot]
  );

  const current = useMemo(() => docFor(tab), [docFor, tab]);
  const fileBase = `native_motor_${tab}_${range[0]}_${range[1]}`;

  const exportPdf = () => current && exportReportPdf([current], settings, `${fileBase}.pdf`);
  const exportCsv = () => current && exportReportCsv([current], `${fileBase}.csv`);
  const exportAllPdf = () => {
    const docs = TABS.map(([t]) => docFor(t)).filter((d): d is ReportDoc => !!d);
    exportReportPdf(docs, settings, `native_motor_laporan_lengkap_${range[0]}_${range[1]}.pdf`);
  };

  const isSnapshotTab = ['debts', 'inventory', 'movement'].includes(tab);
  const s = report?.summary;

  return (
    <div className="flex flex-col gap-3 pb-8">
      <div className="panel p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#111113]">Laporan</h2>
          <p className="text-xs text-[#5B5B63] mt-0.5">Laba rugi, penjualan, pembelian, hutang, persediaan & arus kas — bisa diunduh PDF / Excel</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportPdf}
            disabled={!current}
            className="px-3.5 py-2.5 rounded-[12px] bg-[#111113] text-white hover:bg-[#27272A] text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
          >
            <FileDown size={14} /> PDF
          </button>
          <button
            onClick={exportCsv}
            disabled={!current}
            className="px-3.5 py-2.5 rounded-[12px] bg-white border border-[#E4E4E7] hover:bg-[#F4F4F5] text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
          >
            <FileSpreadsheet size={14} /> Excel (CSV)
          </button>
          <button
            onClick={exportAllPdf}
            disabled={!report || !snapshot}
            className="px-3.5 py-2.5 rounded-[12px] bg-white border border-[#E4E4E7] hover:bg-[#F4F4F5] text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
            title="Semua laporan dalam satu file PDF"
          >
            <Files size={14} /> PDF Lengkap
          </button>
        </div>
      </div>

      {/* Periode */}
      <div className="panel p-4 flex flex-col md:flex-row md:items-center gap-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {([
            ['today', 'Hari ini'],
            ['yesterday', 'Kemarin'],
            ['7d', '7 hari'],
            ['30d', '30 hari'],
            ['month', 'Bulan ini'],
            ['lastmonth', 'Bulan lalu'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setPreset(k);
                setRange(presetRange(k));
              }}
              className={`px-3 py-1.5 rounded-[10px] font-medium ${preset === k ? 'bg-[#111113] text-white' : 'bg-[#F4F4F5] text-[#5B5B63]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 md:ml-auto">
          <input
            type="date"
            value={range[0]}
            max={range[1]}
            onChange={(e) => {
              setPreset('custom');
              setRange([e.target.value, range[1]]);
            }}
            className="px-2.5 py-1.5 rounded-[10px] bg-[#F4F4F5] font-mono outline-none"
          />
          <span className="text-[#71717A]">s/d</span>
          <input
            type="date"
            value={range[1]}
            min={range[0]}
            onChange={(e) => {
              setPreset('custom');
              setRange([range[0], e.target.value]);
            }}
            className="px-2.5 py-1.5 rounded-[10px] bg-[#F4F4F5] font-mono outline-none"
          />
          <button onClick={load} title="Muat ulang" className="p-2 rounded-[10px] bg-[#F4F4F5] hover:bg-[#E4E4E7]">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {error && <div className="panel p-4 text-xs text-[#B91C1C] bg-[#FEE2E2]">{error}</div>}

      {/* KPI */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Penjualan bersih', formatRupiah(s.net_sales), `${s.tx_count} transaksi`],
            ['HPP terjual', formatRupiah(s.cogs), 'Modal barang keluar'],
            ['Laba kotor', formatRupiah(s.gross_profit), `Margin ${pct(s.gross_margin)}`],
            ['Laba bersih', formatRupiah(s.net_profit), `Setelah biaya ${formatRupiah(s.expenses)}`],
          ].map(([label, value, sub], i) => (
            <div key={label} className="panel p-5">
              <span className="text-xs font-medium text-[#5B5B63]">{label}</span>
              <div className={`text-xl md:text-2xl font-semibold tracking-tight mt-1 num ${i === 3 && s.net_profit < 0 ? 'text-[#DC2626]' : i === 2 ? 'text-[#16A34A]' : 'text-[#111113]'}`}>
                {value}
              </div>
              <span className="text-[11px] text-[#6E6E76]">{sub}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab */}
      <div className="panel p-1.5 flex gap-1 overflow-x-auto">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-1.5 rounded-[10px] text-xs font-semibold shrink-0 ${tab === t ? 'bg-[#111113] text-white' : 'text-[#5B5B63] hover:text-[#111113]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isSnapshotTab && (
        <p className="text-[11px] text-[#6E6E76] px-1">Laporan ini menunjukkan kondisi saat ini, tidak terpengaruh pilihan periode.</p>
      )}

      {tab === 'expenses' && report && <ExpenseForm onAdded={() => { load(); onChanged?.(); }} />}

      {current && (
        <>
          {current.summary && tab !== 'summary' && (
            <div className="panel p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {current.summary.map(([k, v]) => (
                <div key={k}>
                  <div className="text-[#6E6E76]">{k}</div>
                  <div className="font-semibold text-sm text-[#111113] num">{v}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'summary' && report && (
            <>
              <DailyChart daily={report.daily} />
              <div className="panel p-5 text-xs">
                {current.summary!.slice(0, 7).map(([k, v], i) => (
                  <div
                    key={k}
                    className={`flex justify-between py-1.5 ${[2, 4, 6].includes(i) ? 'border-t border-[#E4E4E7] font-bold text-[#111113]' : 'text-[#5B5B63]'}`}
                  >
                    <span>{k}</span>
                    <span className="num">{v}</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-x-6 gap-y-1 pt-3 mt-2 border-t border-dashed border-[#E4E4E7] text-[#6E6E76]">
                  {current.summary!.slice(7).map(([k, v]) => (
                    <span key={k}>
                      {k}: <b className="text-[#111113]">{v}</b>
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
          {tab === 'expenses' && report
            ? <ExpenseList report={report} onDeleted={() => { load(); onChanged?.(); }} />
            : current.tables.map((t) => <TableView key={t.title} t={t} />)}
          {tab === 'expenses' && current.tables[0] && <TableView t={current.tables[0]} />}
        </>
      )}

      {!current && loading && (
        <div className="panel p-10 text-center text-xs text-[#6E6E76] flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Memuat laporan…
        </div>
      )}
    </div>
  );
}

function ExpenseForm({ onAdded }: { onAdded: () => void }) {
  const [date, setDate] = useState(() => dk(new Date()));
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseInt(amount.replace(/\D/g, ''), 10) || 0;
    if (value <= 0) return alert('Nominal biaya harus lebih dari 0');
    setBusy(true);
    try {
      await api.addExpense({ date, category, amount: value, note });
      setAmount('');
      setNote('');
      onAdded();
    } catch (err: any) {
      alert(err?.message || 'Gagal menyimpan biaya');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel p-5 grid grid-cols-1 md:grid-cols-12 gap-3 text-xs items-end">
      <label className="md:col-span-2 flex flex-col gap-1">
        <span className="font-semibold">Tanggal</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono outline-none" />
      </label>
      <label className="md:col-span-3 flex flex-col gap-1">
        <span className="font-semibold">Kategori</span>
        <input
          list="expense-cats"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none"
        />
        <datalist id="expense-cats">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="md:col-span-2 flex flex-col gap-1">
        <span className="font-semibold">Nominal (Rp)</span>
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono outline-none"
        />
      </label>
      <label className="md:col-span-3 flex flex-col gap-1">
        <span className="font-semibold">Keterangan</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="opsional" className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none" />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="md:col-span-2 py-2.5 rounded-[10px] bg-[#111113] text-white font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Catat Biaya
      </button>
    </form>
  );
}

function ExpenseList({ report, onDeleted }: { report: PeriodReport; onDeleted: () => void }) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-5 pt-4 pb-2 font-semibold text-sm text-[#111113]">Rincian biaya</div>
      <table className="w-full text-left text-xs">
        <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase tracking-wider">
          <tr>
            <th className="py-2.5 px-3">Tanggal</th>
            <th className="py-2.5 px-3">Kategori</th>
            <th className="py-2.5 px-3">Keterangan</th>
            <th className="py-2.5 px-3 text-right">Jumlah</th>
            <th className="py-2.5 px-3 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F4F4F5]">
          {report.expenses.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-[#71717A]">
                Belum ada biaya di periode ini
              </td>
            </tr>
          )}
          {report.expenses.map((e) => (
            <tr key={e.id} className="hover:bg-[#F9FAFB]">
              <td className="py-2 px-3 font-mono">{formatDateIndo(e.date)}</td>
              <td className="py-2 px-3 font-medium">{e.category}</td>
              <td className="py-2 px-3 text-[#5B5B63]">{e.note || '-'}</td>
              <td className="py-2 px-3 text-right font-mono font-semibold num">{formatRupiah(e.amount)}</td>
              <td className="py-2 px-3">
                <button
                  onClick={async () => {
                    if (!window.confirm(`Hapus biaya ${e.category} ${formatRupiah(e.amount)}?`)) return;
                    try {
                      await api.deleteExpense(e.id);
                      onDeleted();
                    } catch (err: any) {
                      alert(err?.message || 'Gagal menghapus');
                    }
                  }}
                  className="p-1 rounded text-[#DC2626] hover:bg-[#FEE2E2]"
                >
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
