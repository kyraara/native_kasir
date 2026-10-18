/**
 * Laporan & dashboard, dihitung langsung dari MySQL (tidak bergantung data yang dimuat browser).
 *
 * Aturan hitung:
 *  - Penjualan bersih = total faktur lunas (sudah termasuk diskon) − uang retur pada periode itu.
 *  - HPP terjual = HPP faktur lunas − HPP barang retur yang kembali ke stok.
 *    (Barang retur rusak tidak dikurangkan: modalnya hilang.)
 *  - Laba kotor = penjualan bersih − HPP terjual; laba bersih = laba kotor − biaya operasional.
 *  - Retur dihitung di tanggal retur terjadi (bukan tanggal faktur asal).
 */
import { Conn, query, exec, newId, HttpError, isRealDate, LIMITS, intIn } from './db';
import { getSettings } from './repo';

const TZ = process.env.STORE_TZ_OFFSET || '+07:00';

// ---------- Rentang tanggal ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(d: string, label: string): string {
  if (!DATE_RE.test(d || '') || !isRealDate(d)) throw new HttpError(400, `${label} tidak valid (format YYYY-MM-DD)`);
  return d;
}

/** Tanggal lokal toko (YYYY-MM-DD) → batas UTC [mulai, akhir) */
function utcRange(from: string, to: string): [Date, Date] {
  const start = new Date(`${from}T00:00:00${TZ}`);
  const end = new Date(`${to}T00:00:00${TZ}`);
  end.setUTCDate(end.getUTCDate() + 1);
  return [start, end];
}

export function storeToday(): string {
  const offsetMin = (TZ.startsWith('-') ? -1 : 1) * (Number(TZ.slice(1, 3)) * 60 + Number(TZ.slice(4, 6)));
  return new Date(Date.now() + offsetMin * 60000).toISOString().slice(0, 10);
}

function shiftDate(d: string, days: number): string {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

const localDay = (col: string) => `DATE_FORMAT(CONVERT_TZ(${col}, '+00:00', '${TZ}'), '%Y-%m-%d')`;
const n = (v: any) => Number(v || 0);

// ---------- Ringkasan per hari ----------

interface DayRow {
  date: string;
  gross_sales: number;
  tx_count: number;
  refunds: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
}

async function dailySeries(conn: Conn, from: string, to: string): Promise<DayRow[]> {
  const [start, end] = utcRange(from, to);
  const sales = await query(
    conn,
    `SELECT ${localDay('created_at')} AS d, SUM(total) AS gross, COUNT(*) AS tx, SUM(cost_total) AS cogs
     FROM sales WHERE status = 'paid' AND created_at >= ? AND created_at < ? GROUP BY d`,
    [start, end]
  );
  const rets = await query(
    conn,
    `SELECT ${localDay('r.created_at')} AS d,
            SUM(ri.qty * ri.unit_refund) AS refund,
            SUM(CASE WHEN ri.item_condition = 'restock' THEN ri.qty * ri.cost ELSE 0 END) AS restock_cost
     FROM sale_returns r JOIN sale_return_items ri ON ri.return_id = r.id
     WHERE r.created_at >= ? AND r.created_at < ? GROUP BY d`,
    [start, end]
  );
  const map = new Map<string, DayRow>();
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    map.set(d, { date: d, gross_sales: 0, tx_count: 0, refunds: 0, net_sales: 0, cogs: 0, gross_profit: 0 });
  }
  for (const r of sales) {
    const row = map.get(r.d);
    if (!row) continue;
    row.gross_sales = n(r.gross);
    row.tx_count = n(r.tx);
    row.cogs = n(r.cogs);
  }
  for (const r of rets) {
    const row = map.get(r.d);
    if (!row) continue;
    row.refunds = n(r.refund);
    row.cogs -= n(r.restock_cost);
  }
  for (const row of map.values()) {
    row.net_sales = row.gross_sales - row.refunds;
    row.gross_profit = row.net_sales - row.cogs;
  }
  return [...map.values()];
}

// ---------- Laporan periode ----------

export async function periodReport(conn: Conn, fromRaw: string, toRaw: string) {
  const from = checkDate(fromRaw, 'Tanggal awal');
  const to = checkDate(toRaw, 'Tanggal akhir');
  if (from > to) throw new HttpError(400, 'Tanggal awal tidak boleh setelah tanggal akhir');
  if (shiftDate(from, 400) < to) throw new HttpError(400, 'Rentang laporan maksimal 400 hari');
  const [start, end] = utcRange(from, to);

  const daily = await dailySeries(conn, from, to);

  const [disc] = await query(
    conn,
    `SELECT COALESCE(SUM(s.discount), 0) + COALESCE((SELECT SUM(si.discount) FROM sale_items si JOIN sales s2 ON s2.id = si.sale_id
       WHERE s2.status = 'paid' AND s2.created_at >= ? AND s2.created_at < ?), 0) AS discount,
       COUNT(*) AS tx
     FROM sales s WHERE s.status = 'paid' AND s.created_at >= ? AND s.created_at < ?`,
    [start, end, start, end]
  );
  const [voids] = await query(
    conn,
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS total FROM sales WHERE status = 'void' AND created_at >= ? AND created_at < ?`,
    [start, end]
  );
  const [damaged] = await query(
    conn,
    `SELECT COALESCE(SUM(ri.qty * ri.cost), 0) AS loss FROM sale_returns r JOIN sale_return_items ri ON ri.return_id = r.id
     WHERE ri.item_condition = 'damaged' AND r.created_at >= ? AND r.created_at < ?`,
    [start, end]
  );

  // Per produk: pendapatan dialokasikan termasuk diskon faktur (proporsional)
  const soldRows = await query(
    conn,
    `SELECT si.product_id, MAX(si.product_name) AS name, MAX(si.sku) AS sku,
            SUM(si.qty) AS qty,
            SUM((si.price * si.qty - si.discount) * s.total / NULLIF(s.subtotal, 0)) AS revenue,
            SUM(si.qty * si.cost) AS cogs
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'paid' AND s.created_at >= ? AND s.created_at < ?
     GROUP BY si.product_id`,
    [start, end]
  );
  const retRows = await query(
    conn,
    `SELECT ri.product_id, MAX(ri.product_name) AS name, SUM(ri.qty) AS qty, SUM(ri.qty * ri.unit_refund) AS refund,
            SUM(CASE WHEN ri.item_condition = 'restock' THEN ri.qty * ri.cost ELSE 0 END) AS restock_cost
     FROM sale_returns r JOIN sale_return_items ri ON ri.return_id = r.id
     WHERE r.created_at >= ? AND r.created_at < ? GROUP BY ri.product_id`,
    [start, end]
  );
  const productInfo = await query(conn, 'SELECT id, category, sku, name FROM products');
  const infoMap = new Map(productInfo.map((p) => [p.id, p]));

  const byProductMap = new Map<string, any>();
  const ensure = (id: string, name: string) => {
    if (!byProductMap.has(id)) {
      const info = infoMap.get(id);
      byProductMap.set(id, {
        product_id: id,
        name: info?.name || name,
        sku: info?.sku || '',
        category: info?.category || '-',
        qty_sold: 0,
        qty_returned: 0,
        revenue: 0,
        cogs: 0,
      });
    }
    return byProductMap.get(id);
  };
  for (const r of soldRows) {
    const row = ensure(r.product_id, r.name);
    row.qty_sold = n(r.qty);
    row.revenue = Math.round(n(r.revenue));
    row.cogs = n(r.cogs);
  }
  for (const r of retRows) {
    const row = ensure(r.product_id, r.name);
    row.qty_returned = n(r.qty);
    row.revenue -= n(r.refund);
    row.cogs -= n(r.restock_cost);
  }
  const byProduct = [...byProductMap.values()]
    .map((r) => ({ ...r, profit: r.revenue - r.cogs, margin: r.revenue > 0 ? (r.revenue - r.cogs) / r.revenue : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const catMap = new Map<string, any>();
  for (const r of byProduct) {
    const c = catMap.get(r.category) || { category: r.category, qty: 0, revenue: 0, cogs: 0, profit: 0 };
    c.qty += r.qty_sold - r.qty_returned;
    c.revenue += r.revenue;
    c.cogs += r.cogs;
    c.profit += r.profit;
    catMap.set(r.category, c);
  }
  const byCategory = [...catMap.values()].sort((a, b) => b.revenue - a.revenue);

  const payRows = await query(
    conn,
    `SELECT payment_method AS method, COUNT(*) AS tx, SUM(total) AS total FROM sales
     WHERE status = 'paid' AND created_at >= ? AND created_at < ? GROUP BY payment_method`,
    [start, end]
  );
  const refundRows = await query(
    conn,
    `SELECT refund_method AS method, SUM(refund_amount) AS total FROM sale_returns
     WHERE created_at >= ? AND created_at < ? GROUP BY refund_method`,
    [start, end]
  );
  const byPayment = (['cash', 'qris', 'transfer'] as const).map((m) => {
    const p = payRows.find((r) => r.method === m);
    const rf = refundRows.find((r) => r.method === m);
    return { method: m, tx: n(p?.tx), sales: n(p?.total), refunds: n(rf?.total), net: n(p?.total) - n(rf?.total) };
  });

  // Pembelian per supplier
  const purchaseRows = await query(
    conn,
    `SELECT id, number, invoice_no, supplier_id, supplier_name, total, paid_amount, returned_amount, payment_status, due_date, created_at
     FROM purchases WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC`,
    [start, end]
  );
  const purRetRows = await query(
    conn,
    `SELECT supplier_id, MAX(supplier_name) AS supplier_name, SUM(total) AS total, SUM(refund_amount) AS refund
     FROM purchase_returns WHERE created_at >= ? AND created_at < ? GROUP BY supplier_id`,
    [start, end]
  );
  const supMap = new Map<string, any>();
  for (const p of purchaseRows) {
    const s = supMap.get(p.supplier_id) || { supplier_id: p.supplier_id, supplier_name: p.supplier_name, invoices: 0, total: 0, returns: 0, outstanding: 0 };
    s.invoices++;
    s.total += n(p.total);
    s.outstanding += Math.max(0, n(p.total) - n(p.paid_amount) - n(p.returned_amount));
    supMap.set(p.supplier_id, s);
  }
  for (const r of purRetRows) {
    const s = supMap.get(r.supplier_id) || { supplier_id: r.supplier_id, supplier_name: r.supplier_name, invoices: 0, total: 0, returns: 0, outstanding: 0 };
    s.returns += n(r.total);
    supMap.set(r.supplier_id, s);
  }
  const purchasesBySupplier = [...supMap.values()].sort((a, b) => b.total - a.total);

  // Arus kas sederhana
  const [supPay] = await query(
    conn,
    'SELECT COALESCE(SUM(amount), 0) AS total FROM supplier_payments WHERE created_at >= ? AND created_at < ?',
    [start, end]
  );
  const [purRefund] = await query(
    conn,
    'SELECT COALESCE(SUM(refund_amount), 0) AS total FROM purchase_returns WHERE created_at >= ? AND created_at < ?',
    [start, end]
  );
  const expenses = await listExpenses(conn, from, to);
  const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const expenseByCategory = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] || 0) + e.amount), acc), {})
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const grossSales = daily.reduce((a, d) => a + d.gross_sales, 0);
  const refunds = daily.reduce((a, d) => a + d.refunds, 0);
  const cogs = daily.reduce((a, d) => a + d.cogs, 0);
  const netSales = grossSales - refunds;
  const grossProfit = netSales - cogs;

  const cashIn = byPayment.reduce((a, p) => a + p.sales, 0) + n(purRefund.total);
  const cashOut = refunds + n(supPay.total) + expenseTotal;

  return {
    from,
    to,
    summary: {
      gross_sales: grossSales,
      tx_count: n(disc.tx),
      discount_total: n(disc.discount),
      refunds,
      net_sales: netSales,
      cogs,
      gross_profit: grossProfit,
      gross_margin: netSales > 0 ? grossProfit / netSales : 0,
      expenses: expenseTotal,
      net_profit: grossProfit - expenseTotal,
      damaged_loss: n(damaged.loss),
      void_count: n(voids.cnt),
      void_total: n(voids.total),
    },
    daily,
    by_product: byProduct,
    by_category: byCategory,
    by_payment: byPayment,
    purchases: purchaseRows.map((p) => ({
      number: p.number,
      invoice_no: p.invoice_no,
      supplier_name: p.supplier_name,
      total: n(p.total),
      outstanding: Math.max(0, n(p.total) - n(p.paid_amount) - n(p.returned_amount)),
      created_at: (p.created_at as Date).toISOString(),
    })),
    purchases_by_supplier: purchasesBySupplier,
    cash_flow: {
      in_sales: byPayment.map((p) => ({ method: p.method, amount: p.sales })),
      in_supplier_refunds: n(purRefund.total),
      out_customer_refunds: refunds,
      out_supplier_payments: n(supPay.total),
      out_expenses: expenseTotal,
      total_in: cashIn,
      total_out: cashOut,
      net: cashIn - cashOut,
    },
    expenses,
    expense_by_category: expenseByCategory,
  };
}

// ---------- Snapshot: hutang, persediaan, pergerakan ----------

export async function snapshotReport(conn: Conn) {
  const today = storeToday();
  const settings = await getSettings(conn);
  const deadDays = settings.dead_stock_days || 90;

  const debts = await query(
    conn,
    `SELECT supplier_id, supplier_name, number, invoice_no, due_date, total - paid_amount - returned_amount AS outstanding
     FROM purchases WHERE total - paid_amount - returned_amount > 0 ORDER BY due_date`
  );
  const agingMap = new Map<string, any>();
  for (const d of debts) {
    const a = agingMap.get(d.supplier_id) || { supplier_id: d.supplier_id, supplier_name: d.supplier_name, current: 0, d1_30: 0, d31_60: 0, d60: 0, total: 0 };
    const late = d.due_date ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.due_date}T00:00:00Z`)) / 86400000) : 0;
    const amt = n(d.outstanding);
    if (late <= 0) a.current += amt;
    else if (late <= 30) a.d1_30 += amt;
    else if (late <= 60) a.d31_60 += amt;
    else a.d60 += amt;
    a.total += amt;
    agingMap.set(d.supplier_id, a);
  }

  const stats = await productStats(conn);
  const statMap = new Map(stats.map((s) => [s.product_id, s]));
  const products = await query(
    conn,
    'SELECT id, sku, name, category, unit, stock_qty, min_stock, avg_cost, sell_price, created_at FROM products WHERE is_active = 1 ORDER BY category, name'
  );
  const inventory = products.map((p) => ({
    product_id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category || '-',
    unit: p.unit,
    stock_qty: n(p.stock_qty),
    avg_cost: n(p.avg_cost),
    value: Math.max(0, n(p.stock_qty)) * n(p.avg_cost),
    retail_value: Math.max(0, n(p.stock_qty)) * n(p.sell_price),
  }));
  const invCat = new Map<string, any>();
  for (const i of inventory) {
    const c = invCat.get(i.category) || { category: i.category, sku_count: 0, qty: 0, value: 0, retail_value: 0 };
    c.sku_count++;
    c.qty += Math.max(0, i.stock_qty);
    c.value += i.value;
    c.retail_value += i.retail_value;
    invCat.set(i.category, c);
  }

  // Pergerakan: fast = 20% teratas penjualan 30 hari; dead = ada stok tapi tidak terjual > deadDays
  const deadLimit = Date.now() - deadDays * 86400000;
  const withSales = products
    .map((p) => ({ p, s: statMap.get(p.id) }))
    .filter((x) => (x.s?.sold_30d || 0) > 0)
    .sort((a, b) => (b.s!.sold_30d || 0) - (a.s!.sold_30d || 0));
  const fastCut = Math.max(1, Math.ceil(withSales.length * 0.2));
  const fastIds = new Set(withSales.slice(0, fastCut).map((x) => x.p.id));

  const movement = products.map((p) => {
    const s = statMap.get(p.id);
    const lastSold = s?.last_sold_at ? new Date(s.last_sold_at).getTime() : null;
    const ageRef = lastSold ?? new Date(p.created_at).getTime();
    let cls: 'fast' | 'slow' | 'dead' | 'normal' = 'normal';
    if (fastIds.has(p.id)) cls = 'fast';
    else if (n(p.stock_qty) > 0 && ageRef < deadLimit) cls = 'dead';
    else if (n(p.stock_qty) > 0 && (s?.sold_30d || 0) === 0) cls = 'slow';
    return {
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      stock_qty: n(p.stock_qty),
      value: Math.max(0, n(p.stock_qty)) * n(p.avg_cost),
      sold_30d: s?.sold_30d || 0,
      sold_90d: s?.sold_90d || 0,
      last_sold_at: s?.last_sold_at || null,
      class: cls,
    };
  });

  return {
    today,
    dead_stock_days: deadDays,
    debt_aging: [...agingMap.values()].sort((a, b) => b.total - a.total),
    debts: debts.map((d) => ({ ...d, outstanding: n(d.outstanding) })),
    inventory,
    inventory_by_category: [...invCat.values()].sort((a, b) => b.value - a.value),
    movement,
  };
}

/** Penjualan bersih (dikurangi retur) per produk 30/90 hari + tanggal terakhir terjual */
export async function productStats(conn: Conn) {
  const d30 = new Date(Date.now() - 30 * 86400000);
  const d90 = new Date(Date.now() - 90 * 86400000);
  const sold = await query(
    conn,
    `SELECT si.product_id,
            SUM(CASE WHEN s.created_at >= ? THEN si.qty ELSE 0 END) AS sold_30d,
            SUM(CASE WHEN s.created_at >= ? THEN si.qty ELSE 0 END) AS sold_90d,
            MAX(s.created_at) AS last_sold_at
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'paid' GROUP BY si.product_id`,
    [d30, d90]
  );
  const ret = await query(
    conn,
    `SELECT ri.product_id,
            SUM(CASE WHEN r.created_at >= ? THEN ri.qty ELSE 0 END) AS ret_30d,
            SUM(CASE WHEN r.created_at >= ? THEN ri.qty ELSE 0 END) AS ret_90d
     FROM sale_return_items ri JOIN sale_returns r ON r.id = ri.return_id
     WHERE r.created_at >= ? GROUP BY ri.product_id`,
    [d30, d90, d90]
  );
  const retMap = new Map(ret.map((r) => [r.product_id, r]));
  return sold.map((s) => {
    const r = retMap.get(s.product_id);
    return {
      product_id: s.product_id as string,
      sold_30d: Math.max(0, n(s.sold_30d) - n(r?.ret_30d)),
      sold_90d: Math.max(0, n(s.sold_90d) - n(r?.ret_90d)),
      last_sold_at: s.last_sold_at ? (s.last_sold_at as Date).toISOString() : null,
    };
  });
}

// ---------- Dashboard ----------

export async function dashboard(conn: Conn) {
  const today = storeToday();
  const yesterday = shiftDate(today, -1);
  const daily = await dailySeries(conn, shiftDate(today, -89), today);
  const todayRow = daily[daily.length - 1];
  const yRow = daily[daily.length - 2];

  const [start] = utcRange(shiftDate(today, -6), today);
  const top = await query(
    conn,
    `SELECT si.product_id, MAX(si.product_name) AS name, SUM(si.qty) AS qty,
            SUM((si.price * si.qty - si.discount) * s.total / NULLIF(s.subtotal, 0)) AS revenue
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'paid' AND s.created_at >= ?
     GROUP BY si.product_id ORDER BY qty DESC, revenue DESC LIMIT 5`,
    [start]
  );

  const weekEnd = shiftDate(today, 7);
  const dueDebts = await query(
    conn,
    `SELECT id, number, invoice_no, supplier_name, due_date, total - paid_amount - returned_amount AS outstanding
     FROM purchases WHERE total - paid_amount - returned_amount > 0 AND due_date IS NOT NULL AND due_date <= ?
     ORDER BY due_date LIMIT 20`,
    [weekEnd]
  );

  const snap = await snapshotReport(conn);
  return {
    today,
    yesterday,
    today_summary: todayRow,
    yesterday_summary: yRow,
    daily,
    top_products: top.map((t) => ({ product_id: t.product_id, name: t.name, qty: n(t.qty), revenue: Math.round(n(t.revenue)) })),
    due_debts: dueDebts.map((d) => ({ ...d, outstanding: n(d.outstanding) })),
    dead_stock_count: snap.movement.filter((m) => m.class === 'dead').length,
    dead_stock_value: snap.movement.filter((m) => m.class === 'dead').reduce((a, m) => a + m.value, 0),
    dead_stock_days: snap.dead_stock_days,
  };
}

// ---------- Biaya operasional ----------

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  note?: string;
  created_at: string;
}

export async function listExpenses(conn: Conn, from: string, to: string): Promise<Expense[]> {
  const rows = await query(
    conn,
    'SELECT * FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date DESC, created_at DESC',
    [checkDate(from, 'Tanggal awal'), checkDate(to, 'Tanggal akhir')]
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.expense_date,
    category: r.category,
    amount: n(r.amount),
    note: r.note ?? undefined,
    created_at: (r.created_at as Date).toISOString(),
  }));
}

export async function addExpense(conn: Conn, input: { date: string; category: string; amount: number; note?: string }) {
  const amount = intIn(input.amount, 'Nominal biaya', 1, LIMITS.money);
  if (!input.category?.trim()) throw new HttpError(400, 'Kategori biaya wajib diisi');
  await exec(conn, 'INSERT INTO expenses (id, expense_date, category, amount, note) VALUES (?,?,?,?,?)', [
    newId('exp'),
    checkDate(input.date, 'Tanggal'),
    input.category.trim().slice(0, 80),
    amount,
    input.note?.trim().slice(0, 255) || null,
  ]);
}

export async function deleteExpense(conn: Conn, id: string) {
  const res = await exec(conn, 'DELETE FROM expenses WHERE id = ?', [id]);
  if (!res.affectedRows) throw new HttpError(404, 'Biaya tidak ditemukan');
}
