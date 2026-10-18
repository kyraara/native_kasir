/**
 * Penyusun isi laporan. Dokumen yang sama dipakai untuk tampilan layar, PDF, dan Excel,
 * sehingga ketiganya selalu identik.
 */
import type { PaymentMethod } from '../types';
import { formatRupiah, formatDateIndo, formatDateTimeIndo } from './pricing';
import type { PeriodReport, SnapshotReport } from './api';
import type { ReportDoc } from './reportExport';

export const METHOD: Record<PaymentMethod, string> = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };
export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
/** Nilai pengurang: "-Rp 5.000", atau "Rp 0" bila nol */
const minus = (v: number) => (v ? `-${formatRupiah(v)}` : formatRupiah(0));

export function periodLabel(r: { from: string; to: string }) {
  return r.from === r.to ? `Tanggal ${formatDateIndo(r.from)}` : `Periode ${formatDateIndo(r.from)} - ${formatDateIndo(r.to)}`;
}

export function summaryDoc(r: PeriodReport): ReportDoc {
  const s = r.summary;
  return {
    title: 'Laporan Laba Rugi',
    period: periodLabel(r),
    summary: [
      ['Penjualan kotor', formatRupiah(s.gross_sales)],
      ['Retur penjualan', minus(s.refunds)],
      ['Penjualan bersih', formatRupiah(s.net_sales)],
      ['HPP terjual', minus(s.cogs)],
      ['Laba kotor', `${formatRupiah(s.gross_profit)} (${pct(s.gross_margin)})`],
      ['Biaya operasional', minus(s.expenses)],
      ['Laba bersih', formatRupiah(s.net_profit)],
      ['Jumlah transaksi', `${s.tx_count} struk`],
      ['Total diskon diberikan', formatRupiah(s.discount_total)],
      ['Transaksi void', `${s.void_count} (${formatRupiah(s.void_total)})`],
    ],
    tables: [
      {
        title: 'Rincian per hari',
        head: ['Tanggal', 'Trx', 'Penjualan', 'Retur', 'Penjualan bersih', 'HPP', 'Laba kotor'],
        rows: r.daily.map((d) => [formatDateIndo(d.date), d.tx_count, d.gross_sales, d.refunds, d.net_sales, d.cogs, d.gross_profit]),
        foot: ['Total', s.tx_count, s.gross_sales, s.refunds, s.net_sales, s.cogs, s.gross_profit],
        note:
          s.damaged_loss > 0
            ? `Termasuk kerugian barang retur rusak sebesar ${formatRupiah(s.damaged_loss)} (modal tidak kembali).`
            : 'Retur dihitung pada tanggal retur terjadi. HPP memakai harga pokok rata-rata saat barang terjual.',
      },
      {
        title: 'Biaya operasional per kategori',
        head: ['Kategori', 'Jumlah'],
        rows: r.expense_by_category.map((e) => [e.category, e.amount]),
        foot: ['Total', s.expenses],
      },
    ],
  };
}

export function salesDoc(r: PeriodReport): ReportDoc {
  const s = r.summary;
  return {
    title: 'Laporan Penjualan',
    period: periodLabel(r),
    summary: [
      ['Penjualan bersih', formatRupiah(s.net_sales)],
      ['Jumlah transaksi', `${s.tx_count} struk`],
      ['Rata-rata per struk', formatRupiah(s.tx_count ? Math.round(s.gross_sales / s.tx_count) : 0)],
      ['Laba kotor', formatRupiah(s.gross_profit)],
    ],
    tables: [
      {
        title: 'Per produk',
        head: ['Produk', 'SKU', 'Terjual', 'Retur', 'Penjualan bersih', 'HPP', 'Laba', 'Margin'],
        rows: r.by_product.map((p) => [p.name, p.sku, p.qty_sold, p.qty_returned, p.revenue, p.cogs, p.profit, pct(p.margin)]),
        // Total = jumlah baris (pembulatan alokasi diskon faktur bisa beda beberapa rupiah dari ringkasan)
        foot: (() => {
          const sum = (k: 'qty_sold' | 'qty_returned' | 'revenue' | 'cogs' | 'profit') => r.by_product.reduce((a, p) => a + p[k], 0);
          const rev = sum('revenue');
          return ['Total', '', sum('qty_sold'), sum('qty_returned'), rev, sum('cogs'), sum('profit'), pct(rev > 0 ? sum('profit') / rev : 0)];
        })(),
        numericCols: [2, 3, 4, 5, 6, 7],
      },
      {
        title: 'Per kategori',
        head: ['Kategori', 'Qty bersih', 'Penjualan bersih', 'HPP', 'Laba'],
        rows: r.by_category.map((c) => [c.category, c.qty, c.revenue, c.cogs, c.profit]),
      },
      {
        title: 'Per metode bayar',
        head: ['Metode', 'Trx', 'Penjualan', 'Retur dikembalikan', 'Bersih'],
        rows: r.by_payment.map((p) => [METHOD[p.method], p.tx, p.sales, p.refunds, p.net]),
        foot: ['Total', r.by_payment.reduce((a, p) => a + p.tx, 0), s.gross_sales, s.refunds, s.net_sales],
      },
    ],
  };
}

export function purchasesDoc(r: PeriodReport): ReportDoc {
  const total = r.purchases.reduce((a, p) => a + p.total, 0);
  return {
    title: 'Laporan Pembelian',
    period: periodLabel(r),
    summary: [
      ['Total pembelian', formatRupiah(total)],
      ['Jumlah faktur', `${r.purchases.length}`],
    ],
    tables: [
      {
        title: 'Per supplier',
        head: ['Supplier', 'Faktur', 'Total beli', 'Retur', 'Sisa hutang'],
        rows: r.purchases_by_supplier.map((s) => [s.supplier_name, s.invoices, s.total, s.returns, s.outstanding]),
        foot: [
          'Total',
          r.purchases_by_supplier.reduce((a, s) => a + s.invoices, 0),
          total,
          r.purchases_by_supplier.reduce((a, s) => a + s.returns, 0),
          r.purchases_by_supplier.reduce((a, s) => a + s.outstanding, 0),
        ],
      },
      {
        title: 'Daftar faktur pembelian',
        head: ['Tanggal', 'No.', 'No. faktur supplier', 'Supplier', 'Total', 'Sisa hutang'],
        rows: r.purchases.map((p) => [formatDateTimeIndo(p.created_at), p.number, p.invoice_no || '-', p.supplier_name, p.total, p.outstanding]),
      },
    ],
  };
}

export function debtsDoc(s: SnapshotReport): ReportDoc {
  const sum = (k: 'current' | 'd1_30' | 'd31_60' | 'd60' | 'total') => s.debt_aging.reduce((a, d) => a + d[k], 0);
  return {
    title: 'Laporan Umur Hutang',
    period: `Per ${formatDateIndo(s.today)}`,
    summary: [
      ['Total hutang', formatRupiah(sum('total'))],
      ['Sudah lewat jatuh tempo', formatRupiah(sum('d1_30') + sum('d31_60') + sum('d60'))],
    ],
    tables: [
      {
        title: 'Umur hutang per supplier',
        head: ['Supplier', 'Belum jatuh tempo', 'Lewat 1-30 hr', 'Lewat 31-60 hr', 'Lewat >60 hr', 'Total'],
        rows: s.debt_aging.map((d) => [d.supplier_name, d.current, d.d1_30, d.d31_60, d.d60, d.total]),
        foot: ['Total', sum('current'), sum('d1_30'), sum('d31_60'), sum('d60'), sum('total')],
      },
      {
        title: 'Rincian faktur belum lunas',
        head: ['Supplier', 'No.', 'No. faktur', 'Jatuh tempo', 'Sisa'],
        rows: s.debts.map((d) => [d.supplier_name, d.number, d.invoice_no || '-', d.due_date ? formatDateIndo(d.due_date) : '-', d.outstanding]),
      },
    ],
  };
}

export function inventoryDoc(s: SnapshotReport): ReportDoc {
  const value = s.inventory.reduce((a, i) => a + i.value, 0);
  const retail = s.inventory.reduce((a, i) => a + i.retail_value, 0);
  return {
    title: 'Laporan Persediaan',
    period: `Per ${formatDateIndo(s.today)}`,
    summary: [
      ['Nilai persediaan (HPP)', formatRupiah(value)],
      ['Nilai jual (harga ecer)', formatRupiah(retail)],
      ['Potensi laba kotor', formatRupiah(retail - value)],
      ['Jumlah SKU aktif', `${s.inventory.length}`],
    ],
    tables: [
      {
        title: 'Per kategori',
        head: ['Kategori', 'SKU', 'Qty', 'Nilai HPP', 'Nilai jual'],
        rows: s.inventory_by_category.map((c) => [c.category, c.sku_count, c.qty, c.value, c.retail_value]),
        foot: ['Total', s.inventory.length, s.inventory_by_category.reduce((a, c) => a + c.qty, 0), value, retail],
      },
      {
        title: 'Per produk',
        head: ['Produk', 'SKU', 'Kategori', 'Stok', 'HPP rata-rata', 'Nilai'],
        rows: s.inventory.map((i) => [i.name, i.sku, i.category, `${i.stock_qty} ${i.unit}`, i.avg_cost, i.value]),
        numericCols: [3, 4, 5],
      },
    ],
  };
}

export const CLASS_LABEL = { fast: 'Fast moving', normal: 'Normal', slow: 'Slow moving', dead: 'Dead stock' } as const;

export function movementDoc(s: SnapshotReport): ReportDoc {
  const order = { fast: 0, normal: 1, slow: 2, dead: 3 };
  const rows = [...s.movement].sort((a, b) => order[a.class] - order[b.class] || b.sold_30d - a.sold_30d);
  const count = (c: keyof typeof order) => s.movement.filter((m) => m.class === c).length;
  const deadValue = s.movement.filter((m) => m.class === 'dead').reduce((a, m) => a + m.value, 0);
  return {
    title: 'Laporan Pergerakan Barang',
    period: `Per ${formatDateIndo(s.today)}`,
    summary: [
      ['Fast moving', `${count('fast')} produk`],
      ['Slow moving', `${count('slow')} produk`],
      [`Dead stock (> ${s.dead_stock_days} hari)`, `${count('dead')} produk`],
      ['Modal tertahan di dead stock', formatRupiah(deadValue)],
    ],
    tables: [
      {
        title: 'Status per produk',
        head: ['Produk', 'SKU', 'Status', 'Terjual 30 hr', 'Terjual 90 hr', 'Terakhir terjual', 'Stok', 'Nilai stok'],
        rows: rows.map((m) => [
          m.name,
          m.sku,
          CLASS_LABEL[m.class],
          m.sold_30d,
          m.sold_90d,
          m.last_sold_at ? formatDateIndo(m.last_sold_at) : 'Belum pernah',
          m.stock_qty,
          m.value,
        ]),
        numericCols: [3, 4, 6, 7],
        note: `Fast moving = 20% produk terlaris 30 hari terakhir. Slow moving = ada stok tapi tidak terjual 30 hari. Dead stock = ada stok tapi tidak terjual lebih dari ${s.dead_stock_days} hari (bisa diatur di Pengaturan).`,
      },
    ],
  };
}

export function cashDoc(r: PeriodReport): ReportDoc {
  const c = r.cash_flow;
  return {
    title: 'Laporan Arus Kas Sederhana',
    period: periodLabel(r),
    summary: [
      ['Kas masuk', formatRupiah(c.total_in)],
      ['Kas keluar', formatRupiah(c.total_out)],
      ['Arus kas bersih', formatRupiah(c.net)],
    ],
    tables: [
      {
        title: 'Kas masuk',
        head: ['Sumber', 'Jumlah'],
        rows: [...c.in_sales.map((i) => [`Penjualan ${METHOD[i.method]}`, i.amount] as [string, number]), ['Refund retur dari supplier', c.in_supplier_refunds]],
        foot: ['Total kas masuk', c.total_in],
      },
      {
        title: 'Kas keluar',
        head: ['Penggunaan', 'Jumlah'],
        rows: [
          ['Pembayaran ke supplier', c.out_supplier_payments],
          ['Uang retur ke pembeli', c.out_customer_refunds],
          ['Biaya operasional', c.out_expenses],
        ],
        foot: ['Total kas keluar', c.total_out],
        note: 'Kas masuk penjualan mencakup semua metode (tunai, QRIS, transfer). Pembelian tempo baru dihitung saat dibayar.',
      },
    ],
  };
}

export function expensesDoc(r: PeriodReport): ReportDoc {
  return {
    title: 'Laporan Biaya Operasional',
    period: periodLabel(r),
    summary: [['Total biaya', formatRupiah(r.summary.expenses)]],
    tables: [
      {
        title: 'Per kategori',
        head: ['Kategori', 'Jumlah'],
        rows: r.expense_by_category.map((e) => [e.category, e.amount]),
        foot: ['Total', r.summary.expenses],
      },
      {
        title: 'Rincian',
        head: ['Tanggal', 'Kategori', 'Keterangan', 'Jumlah'],
        rows: r.expenses.map((e) => [formatDateIndo(e.date), e.category, e.note || '-', e.amount]),
      },
    ],
  };
}

