import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

export type Conn = Pool | PoolConnection;
export type Row = RowDataPacket & Record<string, any>;

export const DB_NAME = process.env.DB_NAME || 'native_motor';

export const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...dbConfig,
      database: DB_NAME,
      connectionLimit: 10,
      timezone: 'Z', // DATETIME disimpan dalam UTC
      dateStrings: ['DATE'],
      decimalNumbers: true,
      multipleStatements: false,
    });
    // CURRENT_TIMESTAMP harus UTC juga, supaya sama dengan cara mysql2 membaca DATETIME (timezone 'Z')
    pool.pool.on('connection', (conn: any) => conn.query("SET time_zone = '+00:00'"));
  }
  return pool;
}

export async function query<T = Row>(conn: Conn, sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await conn.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

export async function exec(conn: Conn, sql: string, params: any[] = []): Promise<ResultSetHeader> {
  const [res] = await conn.query<ResultSetHeader>(sql, params);
  return res;
}

/** Jalankan fn di dalam satu transaksi; rollback otomatis jika error. */
export async function withTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/** Nomor dokumen per bulan, mis. INV-2610-0001. Aman dipakai bersamaan (atomic). */
/** Tanggal hari ini (YYYY-MM-DD) di zona waktu toko (STORE_TZ_OFFSET, default WIB) */
export function storeLocalDate(at = Date.now()): string {
  const tz = process.env.STORE_TZ_OFFSET || '+07:00';
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
  const offsetMin = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 420;
  return new Date(at + offsetMin * 60000).toISOString().slice(0, 10);
}

export async function nextDocNumber(conn: Conn, prefix: string, digits = 4): Promise<string> {
  const local = storeLocalDate();
  const period = `${local.slice(2, 4)}${local.slice(5, 7)}`;
  await exec(
    conn,
    `INSERT INTO doc_counters (prefix, period, last_no) VALUES (?, ?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)`,
    [prefix, period]
  );
  const [{ n }] = await query<{ n: number }>(conn, 'SELECT LAST_INSERT_ID() AS n');
  return `${prefix}-${period}-${String(n).padStart(digits, '0')}`;
}

export function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export function toDate(iso: string | undefined | null): Date {
  return iso ? new Date(iso) : new Date();
}

/** Batas wajar supaya angka ekstrem ditolak dengan pesan jelas (bukan error database) */
export const LIMITS = {
  qty: 100_000, // jumlah per baris transaksi / stok
  money: 10_000_000_000, // Rp 10 miliar per harga satuan
  lines: 500, // baris per transaksi
};

export function intIn(value: any, label: string, min: number, max: number): number {
  const v = Math.round(Number(value));
  if (!Number.isFinite(v)) throw new HttpError(400, `${label} harus berupa angka`);
  if (v < min) throw new HttpError(400, min === 1 ? `${label} harus lebih dari 0` : `${label} minimal ${min.toLocaleString('id-ID')}`);
  if (v > max) throw new HttpError(400, `${label} maksimal ${max.toLocaleString('id-ID')}`);
  return v;
}

/** YYYY-MM-DD yang benar-benar ada di kalender */
export function isRealDate(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** URL foto yang boleh disimpan: file upload kita sendiri, atau gambar data URL kecil (data contoh lama) */
export function isSafePhotoUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  if (/^\/uploads\/products\/\d{6}\/[0-9a-f-]{36}\.(webp|jpg|png)$/.test(u)) return true;
  return /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/.test(u) && u.length <= 300_000;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
