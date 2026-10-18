/**
 * Mode offline kasir (PRD §8, POS offline):
 *  - Salinan data toko terakhir disimpan di IndexedDB → aplikasi tetap terbuka tanpa internet.
 *  - Transaksi kasir saat offline masuk antrean dan dikirim otomatis saat online.
 *    Setiap transaksi membawa client_ref unik, jadi pengiriman ulang tidak membuat transaksi ganda.
 */
import type { Sale } from '../types';
import type { AppData, SaleParams } from './api';

const DB_NAME = 'native-motor';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kv<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

const get = <T>(key: string) => kv<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined);
const set = (key: string, value: unknown) => kv('readwrite', (s) => s.put(value, key)).catch(() => undefined);

// ---------- Salinan data ----------

export async function saveSnapshot(data: AppData) {
  await set('snapshot', { saved_at: new Date().toISOString(), data });
}

export async function loadSnapshot(): Promise<{ saved_at: string; data: AppData } | undefined> {
  return get('snapshot');
}

// ---------- Antrean transaksi ----------

export interface QueuedSale {
  client_ref: string;
  created_at: string;
  /** Nomor sementara yang tercetak di struk, mis. OFF-1018-0001 */
  temp_number: string;
  params: Omit<SaleParams, 'items'> & { items: Array<{ product_id: string; qty: number; price: number; discount: number }> };
  error?: string;
}

export async function getQueue(): Promise<QueuedSale[]> {
  return (await get<QueuedSale[]>('sale_queue')) || [];
}

async function setQueue(q: QueuedSale[]) {
  await set('sale_queue', q);
  window.dispatchEvent(new CustomEvent('nm-queue-changed', { detail: q }));
}

export function newClientRef(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Simpan transaksi ke antrean dan kembalikan Sale sementara untuk struk */
export async function enqueueSale(params: SaleParams, clientRef: string): Promise<Sale> {
  const q = await getQueue();
  const now = new Date();
  const temp = `OFF-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(q.length + 1).padStart(4, '0')}`;
  const items = params.items.map((i) => ({ product_id: i.product.id, qty: i.qty, price: i.price, discount: i.discount }));
  await setQueue([...q, { client_ref: clientRef, created_at: now.toISOString(), temp_number: temp, params: { ...params, items } }]);

  const subtotal = params.items.reduce((a, i) => a + i.price * i.qty - i.discount, 0);
  return {
    id: clientRef,
    number: temp,
    customer_name: params.customer_name?.trim() || 'Pelanggan Umum',
    vehicle_note: params.vehicle_note,
    subtotal,
    discount: params.discount,
    total: Math.max(0, subtotal - params.discount),
    cost_total: params.items.reduce((a, i) => a + i.cost * i.qty, 0),
    status: 'paid',
    payment_method: params.payment_method,
    cash_received: params.cash_received,
    change_amount: params.change_amount,
    items: params.items.map((i, idx) => ({
      id: `${clientRef}-${idx}`,
      product_id: i.product.id,
      product_name: i.product.name,
      sku: i.product.sku,
      part_number: i.product.part_number,
      qty: i.qty,
      price: i.price,
      discount: i.discount,
      cost: i.cost,
    })),
    created_at: now.toISOString(),
  };
}

let syncing = false;

/**
 * Kirim antrean ke server berurutan. Berhenti di kegagalan jaringan (coba lagi nanti);
 * transaksi yang ditolak server (mis. stok tidak cukup) ditandai error supaya dicek pemilik.
 */
export async function syncQueue(send: (q: QueuedSale) => Promise<unknown>): Promise<{ sent: number; failed: number; pending: number }> {
  if (syncing) return { sent: 0, failed: 0, pending: (await getQueue()).length };
  syncing = true;
  let sent = 0;
  try {
    for (;;) {
      const queue = await getQueue();
      const next = queue.find((q) => !q.error);
      if (!next) break;
      try {
        await send(next);
        await setQueue((await getQueue()).filter((q) => q.client_ref !== next.client_ref));
        sent++;
      } catch (err: any) {
        if (!err?.status) break; // masih offline
        await setQueue((await getQueue()).map((q) => (q.client_ref === next.client_ref ? { ...q, error: err.message || 'Ditolak server' } : q)));
      }
    }
  } finally {
    syncing = false;
  }
  const rest = await getQueue();
  return { sent, failed: rest.filter((q) => q.error).length, pending: rest.length };
}

/** Coba kirim ulang transaksi yang sebelumnya ditolak (setelah masalahnya dibereskan) */
export async function retryFailed() {
  await setQueue((await getQueue()).map(({ error, ...q }) => q));
}

export async function discardQueued(clientRef: string) {
  await setQueue((await getQueue()).filter((q) => q.client_ref !== clientRef));
}
