import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import type { PoolConnection } from 'mysql2/promise';
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
import {
  initialProducts,
  initialSuppliers,
  initialPurchases,
  initialSales,
  initialStockMovements,
  defaultStoreSettings,
} from '../src/data/mockData';
import { DB_NAME, dbConfig, exec, getPool, withTx, newId, toDate, HttpError } from './db';
import * as repo from './repo';
import { listExpenses } from './reports';

const TABLES = [
  'photo_search_logs',
  'expenses',
  'sale_return_items',
  'sale_returns',
  'purchase_return_items',
  'purchase_returns',
  'opname_items',
  'opname_sessions',
  'stock_movements',
  'supplier_payments',
  'purchase_items',
  'purchases',
  'sale_items',
  'sales',
  'product_photos',
  'product_fitments',
  'products',
  'suppliers',
  'customer_requests',
  'store_settings',
  'doc_counters',
];

export interface Dataset {
  products?: Product[];
  suppliers?: Supplier[];
  sales?: Sale[];
  purchases?: Purchase[];
  movements?: StockMovement[];
  settings?: StoreSettings;
  requests?: CustomerRequest[];
  opnames?: OpnameSession[];
  sale_returns?: SaleReturn[];
  purchase_returns?: PurchaseReturn[];
  expenses?: Array<{ id: string; date: string; category: string; amount: number; note?: string; created_at?: string }>;
}

/** Buat database (jika belum ada) dan jalankan db/schema.sql. Aman diulang. */
export async function migrate(): Promise<void> {
  // Di cPanel database dibuat lewat menu MySQL Databases dan user biasanya tidak punya hak CREATE DATABASE,
  // jadi coba langsung tersambung ke database; buat hanya jika belum ada (mis. di Laragon).
  let conn: mysql.Connection;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, multipleStatements: true });
  } catch (err: any) {
    if (err?.code !== 'ER_BAD_DB_ERROR') throw err;
    conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);
  }
  try {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8');
    await conn.query(sql);

    // Kolom yang ditambahkan setelah tabel pertama kali dibuat
    const addColumn = async (table: string, column: string, definition: string) => {
      const [rows] = await conn.query<any[]>(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [DB_NAME, table, column]
      );
      if (!rows.length) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    };
    await addColumn('purchases', 'returned_amount', 'BIGINT NOT NULL DEFAULT 0 AFTER paid_amount');
    await addColumn('product_photos', 'embedding', 'MEDIUMBLOB NULL');
    // Kasir offline: id unik dari perangkat agar transaksi yang dikirim ulang tidak tercatat dua kali
    await addColumn('sales', 'client_ref', 'VARCHAR(64) NULL AFTER number');
    const [idx] = await conn.query<any[]>(
      "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sales' AND INDEX_NAME = 'uq_sales_client_ref'",
      [DB_NAME]
    );
    if (!idx.length) await conn.query('ALTER TABLE sales ADD UNIQUE KEY uq_sales_client_ref (client_ref)');
    await addColumn('product_photos', 'source', "ENUM('upload','reference') NOT NULL DEFAULT 'upload'");
  } finally {
    await conn.end();
  }
}

export async function isEmpty(): Promise<boolean> {
  const [rows] = await getPool().query<any[]>('SELECT COUNT(*) AS n FROM products');
  return rows[0].n === 0;
}

async function truncateAll(conn: PoolConnection) {
  await exec(conn, 'SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) await exec(conn, `DELETE FROM ${t}`);
  await exec(conn, 'SET FOREIGN_KEY_CHECKS = 1');
}

/** Lanjutkan penomoran dari nomor terbesar yang sudah ada (INV-2610-0042 → 43). */
async function syncCounters(conn: PoolConnection, numbers: string[]) {
  const max = new Map<string, number>();
  for (const num of numbers) {
    const m = /^([A-Z]+)-(\d{4})-(\d+)$/.exec(num || '');
    if (!m) continue;
    const key = `${m[1]}|${m[2]}`;
    max.set(key, Math.max(max.get(key) || 0, Number(m[3])));
  }
  for (const [key, n] of max) {
    const [prefix, period] = key.split('|');
    await exec(
      conn,
      'INSERT INTO doc_counters (prefix, period, last_no) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_no = GREATEST(last_no, VALUES(last_no))',
      [prefix, period, n]
    );
  }
}

/** Tulis dataset mentah apa adanya (dipakai untuk seed & restore backup). */
async function loadDataset(conn: PoolConnection, d: Dataset) {
  await exec(conn, 'SET FOREIGN_KEY_CHECKS = 0');

  for (const s of d.suppliers || []) await repo.saveSupplier(conn, s);

  for (const p of d.products || []) {
    await exec(
      conn,
      `INSERT INTO products (id, sku, part_number, barcode, name, brand, category, part_type, unit, sell_price, sell_price_2,
         avg_cost, stock_qty, min_stock, rack_location, is_active, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id, p.sku, p.part_number || '', p.barcode || '', p.name, p.brand || '', p.category || '', p.part_type || 'aftermarket',
        p.unit || 'pcs', p.sell_price || 0, p.sell_price_2 || null, p.avg_cost || 0, p.stock_qty || 0, p.min_stock || 0,
        p.rack_location || '', p.is_active === false ? 0 : 1, toDate(p.created_at),
      ]
    );
    for (const f of p.fitments || []) {
      await exec(conn, 'INSERT INTO product_fitments (product_id, brand, model, year_from, year_to) VALUES (?,?,?,?,?)', [
        p.id, f.brand, f.model, f.year_from, f.year_to,
      ]);
    }
    for (const [i, url] of (p.photos || []).entries()) {
      await exec(conn, 'INSERT INTO product_photos (product_id, sort_order, url) VALUES (?,?,?)', [p.id, i, url]);
    }
  }

  for (const s of d.sales || []) {
    await exec(
      conn,
      `INSERT INTO sales (id, number, customer_name, vehicle_note, subtotal, discount, total, cost_total, status,
         payment_method, cash_received, change_amount, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        s.id, s.number, s.customer_name || null, s.vehicle_note || null, s.subtotal, s.discount || 0, s.total, s.cost_total,
        s.status, s.payment_method, s.cash_received ?? null, s.change_amount ?? null, toDate(s.created_at),
      ]
    );
    for (const i of s.items || []) {
      await exec(
        conn,
        `INSERT INTO sale_items (id, sale_id, product_id, product_name, sku, part_number, qty, price, discount, cost)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [i.id || newId('si'), s.id, i.product_id, i.product_name, i.sku || '', i.part_number || '', i.qty, i.price, i.discount || 0, i.cost]
      );
    }
  }

  for (const p of d.purchases || []) {
    await exec(
      conn,
      `INSERT INTO purchases (id, number, supplier_id, supplier_name, invoice_no, total, payment_status, paid_amount,
         returned_amount, due_date, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id, p.number, p.supplier_id, p.supplier_name, p.invoice_no || '', p.total, p.payment_status, p.paid_amount || 0,
        p.returned_amount || 0, p.due_date || null, p.note || null, toDate(p.created_at),
      ]
    );
    for (const i of p.items || []) {
      await exec(conn, 'INSERT INTO purchase_items (purchase_id, product_id, product_name, qty, cost) VALUES (?,?,?,?,?)', [
        p.id, i.product_id, i.product_name, i.qty, i.cost,
      ]);
    }
    if (p.paid_amount > 0) {
      await exec(conn, 'INSERT INTO supplier_payments (purchase_id, amount, created_at) VALUES (?,?,?)', [
        p.id, p.paid_amount, toDate(p.created_at),
      ]);
    }
  }

  for (const m of d.movements || []) {
    await exec(
      conn,
      `INSERT INTO stock_movements (id, product_id, product_name, type, qty_change, cost_at_time, balance_after, ref_number, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        m.id || newId('mov'), m.product_id, m.product_name, m.type, m.qty_change, m.cost_at_time, m.balance_after,
        m.ref_number, m.note || null, toDate(m.created_at),
      ]
    );
  }

  for (const r of d.sale_returns || []) {
    await exec(
      conn,
      `INSERT INTO sale_returns (id, number, sale_id, sale_number, refund_amount, cost_total, refund_method, reason, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.id, r.number, r.sale_id, r.sale_number, r.refund_amount, r.cost_total, r.refund_method, r.reason, toDate(r.created_at)]
    );
    for (const i of r.items || []) {
      await exec(
        conn,
        `INSERT INTO sale_return_items (return_id, sale_item_id, product_id, product_name, qty, unit_refund, cost, item_condition)
         VALUES (?,?,?,?,?,?,?,?)`,
        [r.id, i.sale_item_id, i.product_id, i.product_name, i.qty, i.unit_refund, i.cost, i.condition]
      );
    }
  }

  for (const r of d.purchase_returns || []) {
    await exec(
      conn,
      `INSERT INTO purchase_returns (id, number, purchase_id, purchase_number, supplier_id, supplier_name, total, debt_cut,
         refund_amount, reason, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.number, r.purchase_id, r.purchase_number, r.supplier_id, r.supplier_name, r.total, r.debt_cut, r.refund_amount, r.reason, toDate(r.created_at)]
    );
    for (const i of r.items || []) {
      await exec(conn, 'INSERT INTO purchase_return_items (return_id, product_id, product_name, qty, cost) VALUES (?,?,?,?,?)', [
        r.id, i.product_id, i.product_name, i.qty, i.cost,
      ]);
    }
  }

  for (const e of d.expenses || []) {
    await exec(conn, 'INSERT INTO expenses (id, expense_date, category, amount, note, created_at) VALUES (?,?,?,?,?,?)', [
      e.id || newId('exp'), e.date, e.category, e.amount, e.note || null, toDate(e.created_at),
    ]);
  }

  for (const r of d.requests || []) {
    await exec(conn, 'INSERT INTO customer_requests (id, description, photo_url, customer_phone, status, created_at) VALUES (?,?,?,?,?,?)', [
      r.id, r.description, r.photo_url || null, r.customer_phone || null, r.status, toDate(r.created_at),
    ]);
  }

  for (const o of d.opnames || []) {
    await exec(
      conn,
      'INSERT INTO opname_sessions (id, number, scope, target_value, status, started_at, finalized_at) VALUES (?,?,?,?,?,?,?)',
      [o.id, o.number, o.scope, o.target_value || null, o.status, toDate(o.started_at), o.finalized_at ? toDate(o.finalized_at) : null]
    );
    for (const i of o.items || []) {
      await exec(
        conn,
        `INSERT INTO opname_items (session_id, product_id, product_name, rack_location, system_qty, counted_qty, unit_cost)
         VALUES (?,?,?,?,?,?,?)`,
        [o.id, i.product_id, i.product_name, i.rack_location || '', i.system_qty, i.counted_qty, i.unit_cost]
      );
    }
  }

  await repo.saveSettings(conn, { ...defaultStoreSettings, ...(d.settings || {}) });

  await syncCounters(conn, [
    ...(d.sales || []).map((s) => s.number),
    ...(d.purchases || []).map((p) => p.number),
    ...(d.opnames || []).map((o) => o.number),
    ...(d.sale_returns || []).map((r) => r.number),
    ...(d.purchase_returns || []).map((r) => r.number),
    ...(d.movements || []).map((m) => m.ref_number),
  ]);

  await exec(conn, 'SET FOREIGN_KEY_CHECKS = 1');
}

const seedDataset = (): Dataset => ({
  products: initialProducts,
  suppliers: initialSuppliers,
  sales: initialSales,
  purchases: initialPurchases,
  movements: initialStockMovements,
  settings: defaultStoreSettings,
  expenses: [
    { id: 'exp-1', date: '2026-10-05', category: 'Listrik & Air', amount: 450000, note: 'Token PLN & PDAM Oktober' },
    { id: 'exp-2', date: '2026-10-12', category: 'Plastik & Perlengkapan', amount: 85000, note: 'Plastik kresek 10 pak' },
    { id: 'exp-3', date: '2026-10-14', category: 'Konsumsi', amount: 50000, note: 'Galon & kopi sachet' },
  ],
  requests: [
    {
      id: 'req-1',
      description: 'Kampas ganda Aerox 155 original kode B65 dicari pelanggan',
      status: 'open',
      created_at: new Date().toISOString(),
    },
  ],
});

export async function resetToSeed(): Promise<void> {
  await withTx(async (conn) => {
    await truncateAll(conn);
    await loadDataset(conn, seedDataset());
  });
}

/** Kosongkan semua data (untuk mulai pakai data toko asli). Pengaturan toko dipertahankan. */
export async function wipeAll(): Promise<void> {
  await withTx(async (conn) => {
    const settings = await repo.getSettings(conn);
    await truncateAll(conn);
    await repo.saveSettings(conn, settings);
  });
}

export async function exportBackup(): Promise<object> {
  const pool = getPool();
  return {
    app: 'Native Motor Backup',
    version: '2.0',
    exported_at: new Date().toISOString(),
    products: await repo.listProducts(pool),
    sales: await repo.listSales(pool, 1_000_000),
    suppliers: await repo.listSuppliers(pool),
    purchases: await repo.listPurchases(pool),
    movements: await repo.listMovements(pool, undefined, 10_000_000),
    settings: await repo.getSettings(pool),
    requests: await repo.listRequests(pool),
    opnames: await repo.listOpnames(pool),
    sale_returns: await repo.listSaleReturns(pool, undefined, 10_000_000),
    purchase_returns: await repo.listPurchaseReturns(pool, 10_000_000),
    expenses: await listExpenses(pool, '1970-01-01', '2999-12-31'),
  };
}

export async function importBackup(data: any): Promise<void> {
  if (!data || !Array.isArray(data.products)) throw new HttpError(400, 'Format file backup tidak valid');
  await withTx(async (conn) => {
    await truncateAll(conn);
    await loadDataset(conn, data);
  });
}
