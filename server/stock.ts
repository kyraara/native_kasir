/**
 * Semua perubahan stok & HPP lewat sini (STK-01). Setiap fungsi:
 *  1. buka transaksi, kunci baris produk terkait (SELECT ... FOR UPDATE)
 *  2. ubah products.stock_qty / avg_cost
 *  3. tulis stock_movements dengan saldo berjalan
 * Jika satu langkah gagal, semuanya di-rollback.
 */
import type { PoolConnection } from 'mysql2/promise';
import { calculateMovingAverageCost } from '../src/utils/pricing';
import { getPool, query, exec, withTx, newId, nextDocNumber, HttpError, intIn, LIMITS, isRealDate } from './db';
import { getSettings } from './repo';

type MovementType = 'sale' | 'purchase' | 'sale_return' | 'purchase_return' | 'adjustment' | 'opname' | 'void';

interface LockedProduct {
  id: string;
  name: string;
  sku: string;
  part_number: string;
  stock_qty: number;
  avg_cost: number;
}

async function lockProducts(conn: PoolConnection, ids: string[]): Promise<Map<string, LockedProduct>> {
  const unique = [...new Set(ids)].sort(); // urutan tetap → hindari deadlock
  if (!unique.length) return new Map();
  const rows = await query<LockedProduct>(
    conn,
    'SELECT id, name, sku, part_number, stock_qty, avg_cost FROM products WHERE id IN (?) ORDER BY id FOR UPDATE',
    [unique]
  );
  const map = new Map(rows.map((r) => [r.id, r]));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) throw new HttpError(404, `Produk tidak ditemukan: ${missing.join(', ')}`);
  return map;
}

async function writeMovement(
  conn: PoolConnection,
  p: LockedProduct,
  type: MovementType,
  qtyChange: number,
  costAtTime: number,
  ref: string,
  note: string
) {
  p.stock_qty += qtyChange;
  await exec(conn, 'UPDATE products SET stock_qty = ?, avg_cost = ? WHERE id = ?', [p.stock_qty, p.avg_cost, p.id]);
  await exec(
    conn,
    `INSERT INTO stock_movements (id, product_id, product_name, type, qty_change, cost_at_time, balance_after, ref_number, note)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [newId('mov'), p.id, p.name, type, qtyChange, costAtTime, p.stock_qty, ref, note.slice(0, 255)]
  );
}

/** Jumlah barang (1..100.000) */
function posInt(n: any, label: string): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) throw new HttpError(400, `${label} harus lebih dari 0`);
  return intIn(v, label, 1, LIMITS.qty);
}

/** Nominal uang (0..Rp 10 miliar) */
function nonNegInt(n: any, label: string): number {
  const v = Math.round(Number(n || 0));
  if (!Number.isFinite(v) || v < 0) throw new HttpError(400, `${label} tidak boleh negatif`);
  return intIn(v, label, 0, LIMITS.money);
}

function checkLines(items: unknown[] | undefined, label: string) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, `${label} kosong`);
  if (items.length > LIMITS.lines) throw new HttpError(400, `Maksimal ${LIMITS.lines} baris per transaksi`);
}

// ---------- Penjualan (kasir) ----------

export interface SaleInput {
  customer_name?: string;
  vehicle_note?: string;
  items: Array<{ product_id: string; qty: number; price: number; discount: number }>;
  discount: number;
  payment_method: 'cash' | 'qris' | 'transfer';
  cash_received?: number;
  change_amount?: number;
  /** Id unik dari perangkat kasir (transaksi offline yang dikirim ulang tidak dobel) */
  client_ref?: string;
  /** Waktu transaksi sebenarnya untuk transaksi yang dibuat saat offline */
  client_created_at?: string;
}

/** Waktu transaksi offline: dipakai jika masuk akal (maks. 7 hari lalu, tidak di masa depan) */
function offlineTimestamp(iso?: string): Date | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  return t <= now + 5 * 60000 && t >= now - 7 * 86400000 ? new Date(Math.min(t, now)) : null;
}

export async function processSale(input: SaleInput): Promise<string> {
  checkLines(input?.items, 'Keranjang');
  try {
    return await processSaleOnce(input);
  } catch (err: any) {
    // Dua kiriman ulang yang sama datang bersamaan → yang kalah ambil transaksi yang sudah tersimpan
    if (err?.code === 'ER_DUP_ENTRY' && input.client_ref) {
      const [existing] = await query(getPool(), 'SELECT id FROM sales WHERE client_ref = ?', [input.client_ref]);
      if (existing) return existing.id;
    }
    throw err;
  }
}

async function processSaleOnce(input: SaleInput): Promise<string> {
  if (!input.items?.length) throw new HttpError(400, 'Keranjang kosong');
  const clientRef = typeof input.client_ref === 'string' && /^[\w-]{8,64}$/.test(input.client_ref) ? input.client_ref : null;
  if (clientRef) {
    const [existing] = await query(getPool(), 'SELECT id FROM sales WHERE client_ref = ?', [clientRef]);
    if (existing) return existing.id; // sudah pernah tersimpan
  }
  if (!['cash', 'qris', 'transfer'].includes(input.payment_method)) throw new HttpError(400, 'Metode bayar tidak valid');

  return withTx(async (conn) => {
    const settings = await getSettings(conn);
    const products = await lockProducts(conn, input.items.map((i) => i.product_id));

    const lines = input.items.map((i) => {
      const qty = posInt(i.qty, 'Jumlah');
      const price = nonNegInt(i.price, 'Harga');
      const discount = Math.min(nonNegInt(i.discount, 'Diskon'), price * qty);
      return { ...i, qty, price, discount, product: products.get(i.product_id)! };
    });

    // POS-04: cek stok cukup (total per produk, bisa ada baris ganda)
    if (!settings.allow_negative_stock) {
      const need = new Map<string, number>();
      for (const l of lines) need.set(l.product_id, (need.get(l.product_id) || 0) + l.qty);
      for (const [id, qty] of need) {
        const p = products.get(id)!;
        if (p.stock_qty < qty) throw new HttpError(409, `Stok ${p.name} tidak cukup (sisa ${p.stock_qty})`);
      }
    }

    const subtotal = lines.reduce((s, l) => s + l.price * l.qty - l.discount, 0);
    const discount = Math.min(nonNegInt(input.discount, 'Diskon total'), subtotal);
    const total = subtotal - discount;
    if (input.payment_method === 'cash' && input.cash_received !== undefined && input.cash_received !== null) {
      if (nonNegInt(input.cash_received, 'Uang diterima') < total) throw new HttpError(400, 'Uang diterima kurang dari total belanja');
    }
    // HPP diambil dari database, bukan dari browser
    const costTotal = lines.reduce((s, l) => s + l.product.avg_cost * l.qty, 0);

    const saleId = newId('sale');
    const number = await nextDocNumber(conn, 'INV');
    const customer = input.customer_name?.trim() || 'Pelanggan Umum';

    await exec(
      conn,
      `INSERT INTO sales (id, number, client_ref, customer_name, vehicle_note, subtotal, discount, total, cost_total,
         status, payment_method, cash_received, change_amount, created_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'paid', ?,?,?, COALESCE(?, CURRENT_TIMESTAMP(3)))`,
      [
        saleId,
        number,
        clientRef,
        customer.slice(0, 120),
        input.vehicle_note?.trim().slice(0, 120) || null,
        subtotal,
        discount,
        total,
        costTotal,
        input.payment_method,
        input.payment_method === 'cash' ? nonNegInt(input.cash_received, 'Uang diterima') : null,
        input.payment_method === 'cash' ? nonNegInt(input.change_amount, 'Kembalian') : null,
        offlineTimestamp(input.client_created_at),
      ]
    );

    for (const l of lines) {
      const p = l.product;
      await exec(
        conn,
        `INSERT INTO sale_items (id, sale_id, product_id, product_name, sku, part_number, qty, price, discount, cost)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [newId('si'), saleId, p.id, p.name, p.sku, p.part_number, l.qty, l.price, l.discount, p.avg_cost]
      );
      await writeMovement(conn, p, 'sale', -l.qty, p.avg_cost, number, `Penjualan kasir (${customer})`);
    }

    return saleId;
  });
}

// ---------- Void penjualan (POS-09) ----------

const STORE_TZ = process.env.STORE_TZ || 'Asia/Jakarta';

/** Tanggal kalender di zona waktu toko, mis. "2026-10-18" */
export function storeDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function voidSale(saleId: string, reason: string): Promise<void> {
  if (!reason?.trim()) throw new HttpError(400, 'Alasan pembatalan wajib diisi');
  await withTx(async (conn) => {
    const [sale] = await query(conn, 'SELECT * FROM sales WHERE id = ? FOR UPDATE', [saleId]);
    if (!sale) throw new HttpError(404, 'Transaksi tidak ditemukan');
    if (sale.status === 'void') throw new HttpError(409, 'Transaksi sudah dibatalkan');
    if (storeDateKey(sale.created_at) !== storeDateKey(new Date())) {
      throw new HttpError(409, 'Void hanya bisa di hari yang sama. Untuk transaksi lama, gunakan Retur.');
    }
    const [ret] = await query(conn, 'SELECT number FROM sale_returns WHERE sale_id = ? LIMIT 1', [saleId]);
    if (ret) throw new HttpError(409, `Transaksi ini sudah punya retur (${ret.number}), tidak bisa di-void`);

    const items = await query(conn, 'SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
    const products = await lockProducts(conn, items.map((i) => i.product_id));

    await exec(conn, "UPDATE sales SET status = 'void', void_reason = ? WHERE id = ?", [reason.trim().slice(0, 255), saleId]);
    for (const it of items) {
      await writeMovement(conn, products.get(it.product_id)!, 'void', it.qty, it.cost, sale.number, `Pembatalan (Void): ${reason}`);
    }
  });
}

// ---------- Penerimaan barang dari supplier ----------

export interface PurchaseInput {
  supplier_id: string;
  invoice_no: string;
  due_date: string;
  payment_status: 'paid' | 'credit' | 'partial';
  paid_amount: number;
  items: Array<{ product_id: string; qty: number; cost: number }>;
  note?: string;
}

export async function processPurchase(input: PurchaseInput): Promise<string> {
  checkLines(input?.items, 'Item pembelian');

  return withTx(async (conn) => {
    const [supplier] = await query(conn, 'SELECT id, name FROM suppliers WHERE id = ?', [input.supplier_id]);
    if (!supplier) throw new HttpError(404, 'Supplier tidak ditemukan');

    const products = await lockProducts(conn, input.items.map((i) => i.product_id));
    const lines = input.items.map((i) => ({
      product: products.get(i.product_id)!,
      qty: posInt(i.qty, 'Jumlah'),
      cost: nonNegInt(i.cost, 'Harga beli'),
    }));

    const total = lines.reduce((s, l) => s + l.qty * l.cost, 0);
    if (total <= 0) throw new HttpError(400, 'Total pembelian tidak boleh 0');
    let paid =
      input.payment_status === 'paid' ? total : input.payment_status === 'credit' ? 0 : nonNegInt(input.paid_amount, 'Jumlah bayar');
    paid = Math.min(paid, total);
    const status = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'credit';

    const purchaseId = newId('pur');
    const number = await nextDocNumber(conn, 'PB');

    await exec(
      conn,
      `INSERT INTO purchases (id, number, supplier_id, supplier_name, invoice_no, total, payment_status, paid_amount, due_date, note)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        purchaseId,
        number,
        supplier.id,
        supplier.name,
        (input.invoice_no || '').slice(0, 60),
        total,
        status,
        paid,
        status === 'paid' || !isRealDate(input.due_date) ? null : input.due_date,
        input.note?.slice(0, 255) || null,
      ]
    );
    if (paid > 0) {
      await exec(conn, 'INSERT INTO supplier_payments (purchase_id, amount) VALUES (?,?)', [purchaseId, paid]);
    }

    for (const l of lines) {
      const p = l.product;
      await exec(conn, 'INSERT INTO purchase_items (purchase_id, product_id, product_name, qty, cost) VALUES (?,?,?,?,?)', [
        purchaseId,
        p.id,
        p.name,
        l.qty,
        l.cost,
      ]);
      // PRD-04: HPP rata-rata tertimbang
      p.avg_cost = calculateMovingAverageCost(p.stock_qty, p.avg_cost, l.qty, l.cost);
      await writeMovement(
        conn,
        p,
        'purchase',
        l.qty,
        l.cost,
        number,
        `Penerimaan barang dari ${supplier.name}${input.invoice_no ? ` (Inv: ${input.invoice_no})` : ''}`
      );
    }

    return purchaseId;
  });
}

// ---------- Bayar hutang supplier ----------

export async function recordSupplierPayment(purchaseId: string, amount: number): Promise<void> {
  const pay = intIn(amount, 'Jumlah bayar', 1, LIMITS.money);
  await withTx(async (conn) => {
    const [pur] = await query(conn, 'SELECT total, paid_amount, returned_amount FROM purchases WHERE id = ? FOR UPDATE', [purchaseId]);
    if (!pur) throw new HttpError(404, 'Pembelian tidak ditemukan');
    const remaining = pur.total - pur.paid_amount - pur.returned_amount;
    if (remaining <= 0) throw new HttpError(409, 'Hutang ini sudah lunas');
    const applied = Math.min(pay, remaining);
    const newPaid = pur.paid_amount + applied;
    await exec(conn, 'UPDATE purchases SET paid_amount = ?, payment_status = ? WHERE id = ?', [
      newPaid,
      newPaid + pur.returned_amount >= pur.total ? 'paid' : 'partial',
      purchaseId,
    ]);
    await exec(conn, 'INSERT INTO supplier_payments (purchase_id, amount) VALUES (?,?)', [purchaseId, applied]);
  });
}

// ---------- Penyesuaian manual (STK-05) ----------

const ADJ_REASONS = ['rusak', 'hilang', 'pemakaian_sendiri', 'koreksi'] as const;

export async function manualAdjustStock(productId: string, newStockQty: number, reason: string, note?: string): Promise<void> {
  if (!ADJ_REASONS.includes(reason as any)) throw new HttpError(400, 'Alasan penyesuaian wajib dipilih');
  const target = intIn(newStockQty, 'Stok baru', -LIMITS.qty, LIMITS.qty);

  await withTx(async (conn) => {
    const p = (await lockProducts(conn, [productId])).get(productId)!;
    const diff = target - p.stock_qty;
    if (diff === 0) return;
    const ref = await nextDocNumber(conn, 'ADJ');
    await writeMovement(conn, p, 'adjustment', diff, p.avg_cost, ref, `Penyesuaian manual: ${reason}${note ? ` (${note})` : ''}`);
  });
}

// ---------- Finalisasi stock opname ----------

export async function finalizeOpname(sessionId: string): Promise<void> {
  await withTx(async (conn) => {
    const [session] = await query(conn, 'SELECT * FROM opname_sessions WHERE id = ? FOR UPDATE', [sessionId]);
    if (!session) throw new HttpError(404, 'Sesi opname tidak ditemukan');
    if (session.status === 'final') throw new HttpError(409, 'Sesi opname sudah final');

    const items = await query(conn, 'SELECT * FROM opname_items WHERE session_id = ?', [sessionId]);
    const products = await lockProducts(conn, items.map((i) => i.product_id));

    for (const it of items) {
      const p = products.get(it.product_id)!;
      // Selisih dihitung dari stok sistem SAAT INI, bukan saat sesi dibuka,
      // supaya penjualan selama opname tidak menggandakan koreksi.
      const diff = it.counted_qty - p.stock_qty;
      if (diff === 0) continue;
      await writeMovement(
        conn,
        p,
        'opname',
        diff,
        p.avg_cost,
        session.number,
        `Hasil Stock Opname (Sistem: ${p.stock_qty}, Fisik: ${it.counted_qty})`
      );
    }
    await exec(conn, "UPDATE opname_sessions SET status = 'final', finalized_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [sessionId]);
  });
}

// ---------- Retur penjualan (POS-10) ----------

export interface SaleReturnInput {
  sale_id: string;
  reason: string;
  refund_method: 'cash' | 'qris' | 'transfer';
  items: Array<{ sale_item_id: string; qty: number; condition: 'restock' | 'damaged' }>;
}

export async function processSaleReturn(input: SaleReturnInput): Promise<string> {
  if (!input.reason?.trim()) throw new HttpError(400, 'Alasan retur wajib diisi');
  if (!['cash', 'qris', 'transfer'].includes(input.refund_method)) throw new HttpError(400, 'Metode pengembalian dana tidak valid');
  const wanted = (input.items || []).filter((i) => Number(i.qty) > 0);
  if (!wanted.length) throw new HttpError(400, 'Pilih minimal satu barang yang diretur');

  return withTx(async (conn) => {
    const [sale] = await query(conn, 'SELECT * FROM sales WHERE id = ? FOR UPDATE', [input.sale_id]);
    if (!sale) throw new HttpError(404, 'Transaksi tidak ditemukan');
    if (sale.status === 'void') throw new HttpError(409, 'Transaksi sudah di-void, tidak bisa diretur');

    const saleItems = await query(conn, 'SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]);
    const returned = await query(
      conn,
      `SELECT ri.sale_item_id, SUM(ri.qty) AS qty FROM sale_return_items ri
       JOIN sale_returns r ON r.id = ri.return_id WHERE r.sale_id = ? GROUP BY ri.sale_item_id`,
      [sale.id]
    );
    const returnedMap = new Map(returned.map((r) => [r.sale_item_id, Number(r.qty)]));
    // Diskon total faktur dibagi proporsional ke tiap barang
    const factor = sale.subtotal > 0 ? sale.total / sale.subtotal : 0;

    const lines = wanted.map((w) => {
      const si = saleItems.find((x) => x.id === w.sale_item_id);
      if (!si) throw new HttpError(400, 'Barang tidak ada di transaksi ini');
      const qty = posInt(w.qty, 'Jumlah retur');
      const left = si.qty - (returnedMap.get(si.id) || 0);
      if (qty > left) throw new HttpError(409, `${si.product_name}: maksimal retur ${left} (terjual ${si.qty})`);
      if (!['restock', 'damaged'].includes(w.condition)) throw new HttpError(400, 'Kondisi barang tidak valid');
      const unitRefund = Math.round(((si.price * si.qty - si.discount) / si.qty) * factor);
      return { si, qty, unitRefund, condition: w.condition };
    });

    const products = await lockProducts(conn, lines.map((l) => l.si.product_id));
    const refund = lines.reduce((s, l) => s + l.unitRefund * l.qty, 0);
    const costTotal = lines.reduce((s, l) => s + l.si.cost * l.qty, 0);
    const id = newId('rj');
    const number = await nextDocNumber(conn, 'RJ');

    await exec(
      conn,
      `INSERT INTO sale_returns (id, number, sale_id, sale_number, refund_amount, cost_total, refund_method, reason)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, number, sale.id, sale.number, refund, costTotal, input.refund_method, input.reason.trim().slice(0, 255)]
    );
    for (const l of lines) {
      await exec(
        conn,
        `INSERT INTO sale_return_items (return_id, sale_item_id, product_id, product_name, qty, unit_refund, cost, item_condition)
         VALUES (?,?,?,?,?,?,?,?)`,
        [id, l.si.id, l.si.product_id, l.si.product_name, l.qty, l.unitRefund, l.si.cost, l.condition]
      );
      if (l.condition === 'restock') {
        const p = products.get(l.si.product_id)!;
        p.avg_cost = calculateMovingAverageCost(p.stock_qty, p.avg_cost, l.qty, l.si.cost);
        await writeMovement(conn, p, 'sale_return', l.qty, l.si.cost, number, `Retur dari ${sale.number}: ${input.reason}`);
      }
      // Barang rusak tidak masuk stok jual; tercatat di retur sebagai kerugian (cost)
    }
    return id;
  });
}

// ---------- Retur pembelian ke supplier (BLI-10) ----------

export interface PurchaseReturnInput {
  purchase_id: string;
  reason: string;
  items: Array<{ product_id: string; qty: number }>;
}

export async function processPurchaseReturn(input: PurchaseReturnInput): Promise<string> {
  if (!input.reason?.trim()) throw new HttpError(400, 'Alasan retur wajib diisi');
  const wanted = (input.items || []).filter((i) => Number(i.qty) > 0);
  if (!wanted.length) throw new HttpError(400, 'Pilih minimal satu barang yang diretur');

  return withTx(async (conn) => {
    const [pur] = await query(conn, 'SELECT * FROM purchases WHERE id = ? FOR UPDATE', [input.purchase_id]);
    if (!pur) throw new HttpError(404, 'Pembelian tidak ditemukan');

    const bought = await query(
      conn,
      `SELECT product_id, MAX(product_name) AS product_name, SUM(qty) AS qty, SUM(qty * cost) AS value
       FROM purchase_items WHERE purchase_id = ? GROUP BY product_id`,
      [pur.id]
    );
    const returned = await query(
      conn,
      `SELECT ri.product_id, SUM(ri.qty) AS qty FROM purchase_return_items ri
       JOIN purchase_returns r ON r.id = ri.return_id WHERE r.purchase_id = ? GROUP BY ri.product_id`,
      [pur.id]
    );
    const returnedMap = new Map(returned.map((r) => [r.product_id, Number(r.qty)]));
    const products = await lockProducts(conn, wanted.map((w) => w.product_id));

    const lines = wanted.map((w) => {
      const b = bought.find((x) => x.product_id === w.product_id);
      if (!b) throw new HttpError(400, 'Barang tidak ada di faktur pembelian ini');
      const qty = posInt(w.qty, 'Jumlah retur');
      const left = Number(b.qty) - (returnedMap.get(b.product_id) || 0);
      if (qty > left) throw new HttpError(409, `${b.product_name}: maksimal retur ${left}`);
      const p = products.get(w.product_id)!;
      if (p.stock_qty < qty) throw new HttpError(409, `${p.name}: stok tinggal ${p.stock_qty}, tidak bisa retur ${qty}`);
      const cost = Math.round(Number(b.value) / Number(b.qty));
      return { p, qty, cost };
    });

    const total = lines.reduce((s, l) => s + l.qty * l.cost, 0);
    const outstanding = Math.max(0, pur.total - pur.paid_amount - pur.returned_amount);
    const debtCut = Math.min(total, outstanding);
    const refund = total - debtCut;
    const id = newId('rb');
    const number = await nextDocNumber(conn, 'RB');

    await exec(
      conn,
      `INSERT INTO purchase_returns (id, number, purchase_id, purchase_number, supplier_id, supplier_name, total, debt_cut, refund_amount, reason)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, number, pur.id, pur.number, pur.supplier_id, pur.supplier_name, total, debtCut, refund, input.reason.trim().slice(0, 255)]
    );

    const newReturned = pur.returned_amount + debtCut;
    const settled = pur.paid_amount + newReturned;
    const status = settled >= pur.total ? 'paid' : settled > 0 ? 'partial' : 'credit';
    await exec(conn, 'UPDATE purchases SET returned_amount = ?, payment_status = ? WHERE id = ?', [newReturned, status, pur.id]);

    for (const l of lines) {
      await exec(conn, 'INSERT INTO purchase_return_items (return_id, product_id, product_name, qty, cost) VALUES (?,?,?,?,?)', [
        id, l.p.id, l.p.name, l.qty, l.cost,
      ]);
      // Keluarkan nilai barang dengan harga belinya (kebalikan rata-rata tertimbang)
      const remainingQty = l.p.stock_qty - l.qty;
      if (remainingQty > 0) {
        const reversed = Math.round((l.p.stock_qty * l.p.avg_cost - l.qty * l.cost) / remainingQty);
        if (reversed > 0) l.p.avg_cost = reversed;
      }
      await writeMovement(conn, l.p, 'purchase_return', -l.qty, l.cost, number, `Retur ke ${pur.supplier_name} (${pur.number}): ${input.reason}`);
    }
    return id;
  });
}
