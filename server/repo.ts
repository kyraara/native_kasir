import type {
  Product,
  Sale,
  Supplier,
  Purchase,
  StockMovement,
  StoreSettings,
  CustomerRequest,
  OpnameSession,
  SaleReturn,
  PurchaseReturn,
} from '../src/types';
import { defaultStoreSettings } from '../src/data/mockData';
import { inspectQris } from '../src/utils/qris';
import type { PoolConnection } from 'mysql2/promise';
import { Conn, query, exec, withTx, newId, nextDocNumber, toIso, toDate, HttpError, intIn, LIMITS, isSafePhotoUrl } from './db';

// ---------- Produk ----------

function mapProduct(r: any, fitments: any[], photos: any[]): Product {
  return {
    id: r.id,
    sku: r.sku,
    part_number: r.part_number,
    barcode: r.barcode,
    name: r.name,
    brand: r.brand,
    category: r.category,
    part_type: r.part_type,
    unit: r.unit,
    sell_price: r.sell_price,
    sell_price_2: r.sell_price_2 ?? undefined,
    avg_cost: r.avg_cost,
    stock_qty: r.stock_qty,
    min_stock: r.min_stock,
    rack_location: r.rack_location,
    is_active: Boolean(r.is_active),
    photos: photos.map((p) => p.url),
    fitments: fitments.map((f) => ({
      brand: f.brand,
      model: f.model,
      year_from: f.year_from,
      year_to: f.year_to,
    })),
    created_at: toIso(r.created_at)!,
  };
}

function groupBy<T extends Record<string, any>>(rows: T[], key: string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

export async function listProducts(conn: Conn, ids?: string[]): Promise<Product[]> {
  const where = ids ? 'WHERE p.id IN (?)' : '';
  const params = ids ? [ids] : [];
  if (ids && ids.length === 0) return [];
  const rows = await query(conn, `SELECT p.* FROM products p ${where} ORDER BY p.created_at DESC, p.id`, params);
  const fitWhere = ids ? 'WHERE product_id IN (?)' : '';
  const fits = await query(conn, `SELECT * FROM product_fitments ${fitWhere} ORDER BY id`, params);
  const photoWhere = ids ? "WHERE product_id IN (?) AND source = 'upload'" : "WHERE source = 'upload'";
  const photos = await query(conn, `SELECT id, product_id, url FROM product_photos ${photoWhere} ORDER BY sort_order, id`, params);
  const fitMap = groupBy(fits, 'product_id');
  const photoMap = groupBy(photos, 'product_id');
  return rows.map((r) => mapProduct(r, fitMap.get(r.id) || [], photoMap.get(r.id) || []));
}

/**
 * Simpan master produk. stock_qty & avg_cost TIDAK ikut diubah di sini (STK-01);
 * untuk produk baru, nilainya diisi sebagai saldo awal dan dicatat di kartu stok.
 */
/** URL foto yang dilepas dari produk pada penyimpanan terakhir (filenya dihapus setelah commit) */
let removedPhotoUrls: string[] = [];

export async function saveProduct(input: Product): Promise<string[]> {
  removedPhotoUrls = [];
  await withTx((conn) => writeProduct(conn, input));
  const removed = removedPhotoUrls;
  removedPhotoUrls = [];
  return removed;
}

interface WriteOptions {
  /** undefined = biarkan kompatibilitas/foto lama (dipakai import CSV) */
  replaceFitments?: boolean;
  replacePhotos?: boolean;
}

/** Tulis satu produk di dalam transaksi yang sudah terbuka. Return 'created' | 'updated'. */
async function writeProduct(
  conn: PoolConnection,
  input: Partial<Product> & { id?: string },
  opts: WriteOptions = { replaceFitments: true, replacePhotos: true }
): Promise<'created' | 'updated'> {
  const name = input.name?.trim();
  const sku = input.sku?.trim();
  if (!name) throw new HttpError(400, 'Nama produk wajib diisi');
  if (!sku) throw new HttpError(400, 'SKU wajib diisi');
  if (!['oem', 'aftermarket', 'used'].includes(input.part_type || 'aftermarket')) throw new HttpError(400, 'Jenis part tidak valid');

  const [existing] = await query(conn, 'SELECT id FROM products WHERE id = ? FOR UPDATE', [input.id || '']);
  const dup = await query(conn, 'SELECT id FROM products WHERE sku = ? AND id <> ?', [sku, input.id || '']);
  if (dup.length) throw new HttpError(409, `SKU ${sku} sudah dipakai produk lain`);
  const barcode = input.barcode?.trim();
  if (barcode) {
    const [dupBarcode] = await query(conn, 'SELECT name FROM products WHERE barcode = ? AND id <> ? LIMIT 1', [barcode, input.id || '']);
    if (dupBarcode) throw new HttpError(409, `Barcode ${barcode} sudah dipakai "${dupBarcode.name}"`);
  }

  if (name.length > 200) throw new HttpError(400, 'Nama produk maksimal 200 karakter');
  if (sku.length > 60) throw new HttpError(400, 'SKU maksimal 60 karakter');
  const sellPrice = intIn(input.sell_price || 0, 'Harga jual', 0, LIMITS.money);
  const sellPrice2 = input.sell_price_2 ? intIn(input.sell_price_2, 'Harga kedua', 0, LIMITS.money) : null;
  const minStock = intIn(input.min_stock || 0, 'Stok minimum', 0, LIMITS.qty);
  const thisYear = new Date().getFullYear();
  for (const f of input.fitments || []) {
    if (!f?.brand?.trim() || !f?.model?.trim()) throw new HttpError(400, 'Merek & model motor wajib diisi');
    if (f.brand.length > 60 || f.model.length > 120) throw new HttpError(400, 'Nama merek/model motor terlalu panjang');
    intIn(f.year_from, 'Tahun motor (dari)', 1950, thisYear + 2);
    intIn(f.year_to, 'Tahun motor (sampai)', 1950, thisYear + 2);
    if (f.year_from > f.year_to) throw new HttpError(400, `Tahun motor ${f.model}: "dari" lebih besar dari "sampai"`);
  }
  if ((input.photos || []).some((u) => !isSafePhotoUrl(u))) throw new HttpError(400, 'Alamat foto tidak valid. Unggah foto lewat tombol yang tersedia.');

  const fields = [
    sku,
    input.part_number?.trim() || '',
    input.barcode?.trim() || '',
    name,
    input.brand?.trim() || '',
    input.category?.trim() || '',
    input.part_type || 'aftermarket',
    input.unit?.trim() || 'pcs',
    sellPrice,
    sellPrice2,
    minStock,
    input.rack_location?.trim() || '',
    input.is_active === false ? 0 : 1,
  ];

  let id = input.id || '';
  if (existing) {
    await exec(
      conn,
      `UPDATE products SET sku=?, part_number=?, barcode=?, name=?, brand=?, category=?, part_type=?,
         unit=?, sell_price=?, sell_price_2=?, min_stock=?, rack_location=?, is_active=? WHERE id=?`,
      [...fields, id]
    );
  } else {
    id = id || newId('prod');
    const openingQty = intIn(input.stock_qty || 0, 'Stok awal', 0, LIMITS.qty);
    const openingCost = intIn(input.avg_cost || 0, 'HPP awal', 0, LIMITS.money);
    await exec(
      conn,
      `INSERT INTO products (sku, part_number, barcode, name, brand, category, part_type, unit,
         sell_price, sell_price_2, min_stock, rack_location, is_active, id, stock_qty, avg_cost, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...fields, id, openingQty, openingCost, toDate(input.created_at)]
    );
    if (openingQty !== 0) {
      await exec(
        conn,
        `INSERT INTO stock_movements (id, product_id, product_name, type, qty_change, cost_at_time, balance_after, ref_number, note)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [newId('mov'), id, name, 'adjustment', openingQty, openingCost, openingQty, 'SALDO-AWAL', 'Saldo awal produk baru']
      );
    }
  }

  if (opts.replaceFitments || (!existing && input.fitments)) {
    await exec(conn, 'DELETE FROM product_fitments WHERE product_id = ?', [id]);
    for (const f of input.fitments || []) {
      await exec(
        conn,
        'INSERT INTO product_fitments (product_id, brand, model, year_from, year_to) VALUES (?,?,?,?,?)',
        [id, f.brand, f.model, f.year_from, f.year_to]
      );
    }
  }
  if (opts.replacePhotos) {
    // Sinkronkan tanpa menghapus foto yang tidak berubah, supaya embedding visualnya tetap tersimpan
    const wanted = (input.photos || []).slice(0, 5);
    const current = await query(conn, "SELECT id, url FROM product_photos WHERE product_id = ? AND source = 'upload'", [id]);
    for (const row of current) {
      if (!wanted.includes(row.url)) {
        await exec(conn, 'DELETE FROM product_photos WHERE id = ?', [row.id]);
        removedPhotoUrls.push(row.url);
      }
    }
    for (const [i, url] of wanted.entries()) {
      const existingRow = current.find((r) => r.url === url);
      if (existingRow) await exec(conn, 'UPDATE product_photos SET sort_order = ? WHERE id = ?', [i, existingRow.id]);
      else await exec(conn, "INSERT INTO product_photos (product_id, sort_order, url, source) VALUES (?,?,?, 'upload')", [id, i, url]);
    }
  }
  return existing ? 'updated' : 'created';
}

export interface ImportItem {
  sku: string;
  name: string;
  part_number?: string;
  barcode?: string;
  brand?: string;
  category?: string;
  part_type?: Product['part_type'];
  unit?: string;
  sell_price: number;
  sell_price_2?: number | null;
  avg_cost?: number | null;
  stock_qty?: number | null;
  min_stock?: number | null;
  rack_location?: string;
  /** null = jangan ubah kompatibilitas produk lama */
  fitments?: Product['fitments'] | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: Array<{ row: number; message: string }>;
}

class DryRunRollback extends Error {}

/**
 * Import massal, cocokkan berdasarkan SKU. Semua baris dalam SATU transaksi:
 * jika ada satu baris error, tidak ada yang tersimpan. dryRun = cek saja lalu rollback.
 */
export async function importProducts(items: ImportItem[], dryRun: boolean): Promise<ImportResult> {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Tidak ada baris untuk di-import');
  if (items.length > 5000) throw new HttpError(400, 'Maksimal 5000 baris per import');

  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  const seen = new Map<string, number>();
  try {
    await withTx(async (conn) => {
      for (const [i, it] of items.entries()) {
        const row = i + 2; // baris 1 = header di file
        const sku = (it.sku || '').trim();
        const key = sku.toLowerCase();
        if (sku && seen.has(key)) {
          result.errors.push({ row, message: `SKU ${sku} dobel (sama dengan baris ${seen.get(key)})` });
          continue;
        }
        seen.set(key, row);
        try {
          const [existing] = await query(conn, 'SELECT id, is_active FROM products WHERE sku = ?', [sku]);
          const outcome = await writeProduct(
            conn,
            {
              ...it,
              id: existing?.id,
              is_active: existing ? Boolean(existing.is_active) : true,
              sell_price_2: it.sell_price_2 ?? undefined,
              avg_cost: it.avg_cost ?? 0,
              stock_qty: it.stock_qty ?? 0,
              min_stock: it.min_stock ?? 0,
              fitments: it.fitments ?? undefined,
            },
            { replaceFitments: !!existing && Array.isArray(it.fitments) && it.fitments.length > 0, replacePhotos: false }
          );
          result[outcome]++;
        } catch (err: any) {
          result.errors.push({ row, message: err?.message || String(err) });
        }
      }
      if (result.errors.length || dryRun) throw new DryRunRollback();
    });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }
  return result;
}

// ---------- Supplier ----------

export async function listSuppliers(conn: Conn): Promise<Supplier[]> {
  const rows = await query(conn, 'SELECT * FROM suppliers ORDER BY created_at DESC, name');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    address: r.address,
    default_term_days: r.default_term_days,
    note: r.note ?? undefined,
  }));
}

export async function saveSupplier(conn: Conn, s: Supplier): Promise<void> {
  if (!s.name?.trim()) throw new HttpError(400, 'Nama supplier wajib diisi');
  await exec(
    conn,
    `INSERT INTO suppliers (id, name, phone, address, default_term_days, note) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone), address=VALUES(address),
       default_term_days=VALUES(default_term_days), note=VALUES(note)`,
    [s.id || newId('sup'), s.name.trim(), s.phone || '', s.address || '', s.default_term_days || 0, s.note || null]
  );
}

// ---------- Penjualan ----------

export async function getSale(conn: Conn, id: string): Promise<Sale | undefined> {
  return (await listSales(conn, 1, id))[0];
}

export async function listSales(conn: Conn, limit = 1000, id?: string): Promise<Sale[]> {
  const rows = id
    ? await query(conn, 'SELECT * FROM sales WHERE id = ?', [id])
    : await query(conn, 'SELECT * FROM sales ORDER BY created_at DESC LIMIT ?', [limit]);
  if (!rows.length) return [];
  const items = await query(conn, 'SELECT * FROM sale_items WHERE sale_id IN (?)', [rows.map((r) => r.id)]);
  const itemMap = groupBy(items, 'sale_id');
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    customer_name: r.customer_name ?? undefined,
    vehicle_note: r.vehicle_note ?? undefined,
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    cost_total: r.cost_total,
    status: r.status,
    void_reason: r.void_reason ?? undefined,
    payment_method: r.payment_method,
    cash_received: r.cash_received ?? undefined,
    change_amount: r.change_amount ?? undefined,
    items: (itemMap.get(r.id) || []).map((i) => ({
      id: i.id,
      product_id: i.product_id,
      product_name: i.product_name,
      sku: i.sku,
      part_number: i.part_number,
      qty: i.qty,
      price: i.price,
      discount: i.discount,
      cost: i.cost,
    })),
    created_at: toIso(r.created_at)!,
  }));
}

// ---------- Pembelian ----------

export async function listPurchases(conn: Conn, ids?: string[]): Promise<Purchase[]> {
  const rows = ids
    ? await query(conn, 'SELECT * FROM purchases WHERE id IN (?)', [ids])
    : await query(conn, 'SELECT * FROM purchases ORDER BY created_at DESC');
  if (!rows.length) return [];
  const items = await query(conn, 'SELECT * FROM purchase_items WHERE purchase_id IN (?) ORDER BY id', [rows.map((r) => r.id)]);
  const itemMap = groupBy(items, 'purchase_id');
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    supplier_id: r.supplier_id,
    supplier_name: r.supplier_name,
    invoice_no: r.invoice_no,
    total: r.total,
    payment_status: r.payment_status,
    paid_amount: r.paid_amount,
    returned_amount: r.returned_amount,
    due_date: r.due_date || '',
    items: (itemMap.get(r.id) || []).map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      qty: i.qty,
      cost: i.cost,
    })),
    note: r.note ?? undefined,
    created_at: toIso(r.created_at)!,
  }));
}

// ---------- Retur ----------

export async function listSaleReturns(conn: Conn, saleIds?: string[], limit = 1000): Promise<SaleReturn[]> {
  if (saleIds && !saleIds.length) return [];
  const rows = saleIds
    ? await query(conn, 'SELECT * FROM sale_returns WHERE sale_id IN (?) ORDER BY created_at DESC', [saleIds])
    : await query(conn, 'SELECT * FROM sale_returns ORDER BY created_at DESC LIMIT ?', [limit]);
  if (!rows.length) return [];
  const items = await query(conn, 'SELECT * FROM sale_return_items WHERE return_id IN (?) ORDER BY id', [rows.map((r) => r.id)]);
  const itemMap = groupBy(items, 'return_id');
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    sale_id: r.sale_id,
    sale_number: r.sale_number,
    refund_amount: r.refund_amount,
    cost_total: r.cost_total,
    refund_method: r.refund_method,
    reason: r.reason,
    items: (itemMap.get(r.id) || []).map((i) => ({
      sale_item_id: i.sale_item_id,
      product_id: i.product_id,
      product_name: i.product_name,
      qty: i.qty,
      unit_refund: i.unit_refund,
      cost: i.cost,
      condition: i.item_condition,
    })),
    created_at: toIso(r.created_at)!,
  }));
}

export async function listPurchaseReturns(conn: Conn, limit = 1000): Promise<PurchaseReturn[]> {
  const rows = await query(conn, 'SELECT * FROM purchase_returns ORDER BY created_at DESC LIMIT ?', [limit]);
  if (!rows.length) return [];
  const items = await query(conn, 'SELECT * FROM purchase_return_items WHERE return_id IN (?) ORDER BY id', [rows.map((r) => r.id)]);
  const itemMap = groupBy(items, 'return_id');
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    purchase_id: r.purchase_id,
    purchase_number: r.purchase_number,
    supplier_id: r.supplier_id,
    supplier_name: r.supplier_name,
    total: r.total,
    debt_cut: r.debt_cut,
    refund_amount: r.refund_amount,
    reason: r.reason,
    items: (itemMap.get(r.id) || []).map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      qty: i.qty,
      cost: i.cost,
    })),
    created_at: toIso(r.created_at)!,
  }));
}

// ---------- Mutasi stok ----------

export async function listMovements(conn: Conn, productId?: string, limit = 2000): Promise<StockMovement[]> {
  const rows = productId
    ? await query(conn, 'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT ?', [productId, limit])
    : await query(conn, 'SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT ?', [limit]);
  return rows.map((r) => ({
    id: r.id,
    product_id: r.product_id,
    product_name: r.product_name,
    type: r.type,
    qty_change: r.qty_change,
    cost_at_time: r.cost_at_time,
    balance_after: r.balance_after,
    ref_number: r.ref_number,
    note: r.note ?? undefined,
    created_at: toIso(r.created_at)!,
  }));
}

// ---------- Pengaturan ----------

export async function getSettings(conn: Conn): Promise<StoreSettings> {
  const [row] = await query(conn, 'SELECT data FROM store_settings WHERE id = 1');
  if (!row) return defaultStoreSettings;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return { ...defaultStoreSettings, ...data };
}

/** Simpan teks QRIS hanya jika benar-benar QRIS valid (CRC cocok); jika tidak → kosong */
function validQrisPayload(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return '';
  try {
    inspectQris(v);
    return v.trim();
  } catch (err: any) {
    throw new HttpError(400, `QRIS tidak valid: ${err?.message || err}`);
  }
}

export async function saveSettings(conn: Conn, input: StoreSettings): Promise<void> {
  const s: StoreSettings = {
    ...defaultStoreSettings,
    ...input,
    dead_stock_days: Math.max(7, Math.round(Number(input.dead_stock_days) || 90)),
    ai_daily_quota: Math.max(0, Math.round(Number(input.ai_daily_quota) || 0)),
    allow_negative_stock: input.allow_negative_stock !== false,
    ai_save_reference: input.ai_save_reference !== false,
    receipt_paper: input.receipt_paper === '80' ? '80' : '58',
    qris_payload: validQrisPayload(input.qris_payload),
    qris_image_url: isSafePhotoUrl(input.qris_image_url) && input.qris_image_url.startsWith('/uploads/') ? input.qris_image_url : '',
    bank_accounts: (Array.isArray(input.bank_accounts) ? input.bank_accounts : [])
      .map((a) => ({ bank: String(a?.bank || '').trim(), number: String(a?.number || '').trim(), holder: String(a?.holder || '').trim() }))
      .filter((a) => a.bank && a.number)
      .slice(0, 5),
  };
  await exec(
    conn,
    'INSERT INTO store_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [JSON.stringify(s)]
  );
}

// ---------- Permintaan pelanggan ----------

export async function listRequests(conn: Conn): Promise<CustomerRequest[]> {
  const rows = await query(conn, 'SELECT * FROM customer_requests ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    photo_url: r.photo_url ?? undefined,
    customer_phone: r.customer_phone ?? undefined,
    status: r.status,
    created_at: toIso(r.created_at)!,
  }));
}

export async function addRequest(conn: Conn, description: string, photo_url?: string): Promise<void> {
  if (typeof description !== 'string' || !description.trim()) throw new HttpError(400, 'Deskripsi wajib diisi');
  if (photo_url && (!/^data:image\/(webp|jpeg|png);base64,/.test(photo_url) || photo_url.length > 2_000_000)) {
    photo_url = undefined; // foto permintaan tidak wajib; abaikan jika tidak valid / terlalu besar
  }
  await exec(conn, 'INSERT INTO customer_requests (id, description, photo_url) VALUES (?,?,?)', [
    newId('req'),
    description.trim().slice(0, 500),
    photo_url || null,
  ]);
}

export async function updateRequestStatus(conn: Conn, id: string, status: string): Promise<void> {
  if (!['open', 'ordered', 'done'].includes(status)) throw new HttpError(400, 'Status tidak valid');
  await exec(conn, 'UPDATE customer_requests SET status = ? WHERE id = ?', [status, id]);
}

// ---------- Stock opname ----------

export async function listOpnames(conn: Conn): Promise<OpnameSession[]> {
  const rows = await query(conn, 'SELECT * FROM opname_sessions ORDER BY started_at DESC');
  if (!rows.length) return [];
  const items = await query(conn, 'SELECT * FROM opname_items WHERE session_id IN (?) ORDER BY id', [rows.map((r) => r.id)]);
  const itemMap = groupBy(items, 'session_id');
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    scope: r.scope,
    target_value: r.target_value ?? undefined,
    status: r.status,
    started_at: toIso(r.started_at)!,
    finalized_at: toIso(r.finalized_at),
    items: (itemMap.get(r.id) || []).map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      rack_location: i.rack_location,
      system_qty: i.system_qty,
      counted_qty: i.counted_qty,
      unit_cost: i.unit_cost,
    })),
  }));
}

/** Simpan draft sesi opname (hanya yang masih 'open'). Nomor dibuat server jika sesi baru. */
export async function saveOpname(session: OpnameSession): Promise<void> {
  if (!Array.isArray(session?.items)) throw new HttpError(400, 'Data opname tidak valid');
  if (!['all', 'category', 'rack'].includes(session.scope)) throw new HttpError(400, 'Cakupan opname tidak valid');
  for (const it of session.items) intIn(it.counted_qty, `Stok fisik ${it.product_name || ''}`.trim(), 0, LIMITS.qty);
  await withTx(async (conn) => {
    const [existing] = await query(conn, 'SELECT status FROM opname_sessions WHERE id = ? FOR UPDATE', [session.id]);
    if (existing?.status === 'final') throw new HttpError(409, 'Sesi opname sudah final, tidak bisa diubah');

    if (!existing) {
      const number = await nextDocNumber(conn, 'OPN', 3);
      await exec(
        conn,
        'INSERT INTO opname_sessions (id, number, scope, target_value, status, started_at) VALUES (?,?,?,?,?,?)',
        [session.id || newId('opn'), number, session.scope, session.target_value || null, 'open', toDate(session.started_at)]
      );
    } else {
      await exec(conn, 'UPDATE opname_sessions SET scope=?, target_value=? WHERE id=?', [
        session.scope,
        session.target_value || null,
        session.id,
      ]);
    }

    await exec(conn, 'DELETE FROM opname_items WHERE session_id = ?', [session.id]);
    for (const it of session.items) {
      await exec(
        conn,
        `INSERT INTO opname_items (session_id, product_id, product_name, rack_location, system_qty, counted_qty, unit_cost)
         VALUES (?,?,?,?,?,?,?)`,
        [
          session.id,
          it.product_id,
          String(it.product_name || '').slice(0, 200),
          String(it.rack_location || '').slice(0, 60),
          Math.round(Number(it.system_qty) || 0),
          Math.round(Number(it.counted_qty)),
          Math.max(0, Math.round(Number(it.unit_cost) || 0)),
        ]
      );
    }
  });
}
