/**
 * Client untuk backend Express + MySQL. Menggantikan utils/storage.ts (localStorage).
 * Semua perubahan stok diproses di server dalam transaksi database.
 */
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
  CartItem,
  PaymentMethod,
} from '../types';

const TOKEN_KEY = 'nm_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* abaikan: mode privat */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Dipanggil saat token kedaluwarsa supaya App bisa kembali ke layar login. */
export const authEvents = new EventTarget();

async function request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Tidak bisa terhubung ke server. Periksa koneksi.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      setToken(null);
      authEvents.dispatchEvent(new Event('logout'));
    }
    throw new ApiError(res.status, data?.error || `Gagal (${res.status})`);
  }
  return data as T;
}

// ---------- Auth ----------

export async function login(password: string): Promise<void> {
  const { token } = await request<{ token: string }>('POST', '/auth/login', { password });
  setToken(token);
}

export function logout() {
  setToken(null);
  authEvents.dispatchEvent(new Event('logout'));
}

/** 'ok' | 'invalid' (perlu login) | 'offline' (tidak bisa cek, tapi ada token → boleh pakai data tersimpan) */
export async function checkSession(): Promise<'ok' | 'invalid' | 'offline'> {
  if (!getToken()) return 'invalid';
  try {
    await request('GET', '/auth/me');
    return 'ok';
  } catch (err: any) {
    return err?.status === 0 ? 'offline' : 'invalid';
  }
}

// ---------- Data ----------

export interface AppData {
  products: Product[];
  sales: Sale[];
  suppliers: Supplier[];
  purchases: Purchase[];
  movements: StockMovement[];
  settings: StoreSettings;
  opnames: OpnameSession[];
  requests: CustomerRequest[];
  sale_returns: SaleReturn[];
  purchase_returns: PurchaseReturn[];
  product_stats: ProductStat[];
}

export const fetchAll = () => request<AppData>('GET', '/bootstrap');

export const saveProduct = (p: Product) => request<Product>('PUT', `/products/${encodeURIComponent(p.id)}`, p);

export const saveSupplier = (s: Supplier) => request('PUT', `/suppliers/${encodeURIComponent(s.id)}`, s);

export const saveSettings = (s: StoreSettings) => request<StoreSettings>('PUT', '/settings', s);

export const addCustomerRequest = (description: string, photo_url?: string) =>
  request('POST', '/requests', { description, photo_url });

export const updateCustomerRequestStatus = (id: string, status: CustomerRequest['status']) =>
  request('PATCH', `/requests/${encodeURIComponent(id)}`, { status });

// ---------- Transaksi ----------

export interface SaleParams {
  customer_name?: string;
  vehicle_note?: string;
  items: CartItem[];
  discount: number;
  payment_method: PaymentMethod;
  cash_received?: number;
  change_amount?: number;
}

export const processSale = (p: SaleParams, clientRef?: string) =>
  request<Sale>('POST', '/sales', {
    ...p,
    client_ref: clientRef,
    // HPP & data produk tidak dikirim; server memakai data di database
    items: p.items.map((i) => ({ product_id: i.product.id, qty: i.qty, price: i.price, discount: i.discount })),
  });

/** Kirim transaksi dari antrean offline (item sudah dalam bentuk id produk) */
export const sendQueuedSale = (q: {
  client_ref: string;
  created_at: string;
  params: Omit<SaleParams, 'items'> & { items: Array<{ product_id: string; qty: number; price: number; discount: number }> };
}) => request<Sale>('POST', '/sales', { ...q.params, client_ref: q.client_ref, client_created_at: q.created_at });

export const voidSale = (saleId: string, reason: string) =>
  request('POST', `/sales/${encodeURIComponent(saleId)}/void`, { reason });

export interface PurchaseParams {
  supplier_id: string;
  supplier_name?: string;
  invoice_no: string;
  due_date: string;
  payment_status: 'paid' | 'credit' | 'partial';
  paid_amount: number;
  items: Array<{ product_id: string; qty: number; cost: number }>;
  note?: string;
}

export interface SaleReturnParams {
  reason: string;
  refund_method: PaymentMethod;
  items: Array<{ sale_item_id: string; qty: number; condition: 'restock' | 'damaged' }>;
}

export const processSaleReturn = (saleId: string, p: SaleReturnParams) =>
  request('POST', `/sales/${encodeURIComponent(saleId)}/returns`, p);

export const processPurchaseReturn = (
  purchaseId: string,
  p: { reason: string; items: Array<{ product_id: string; qty: number }> }
) => request('POST', `/purchases/${encodeURIComponent(purchaseId)}/returns`, p);

export const processPurchase = (p: PurchaseParams) => request<Purchase>('POST', '/purchases', p);

export const recordSupplierPayment = (purchaseId: string, amount: number) =>
  request('POST', `/purchases/${encodeURIComponent(purchaseId)}/payments`, { amount });

export const manualAdjustStock = (
  product_id: string,
  new_stock_qty: number,
  reason: 'rusak' | 'hilang' | 'pemakaian_sendiri' | 'koreksi',
  note?: string
) => request('POST', '/stock/adjust', { product_id, new_stock_qty, reason, note });

export const saveOpnameSession = (s: OpnameSession) => request('PUT', `/opnames/${encodeURIComponent(s.id)}`, s);

export const finalizeOpnameSession = (id: string) => request('POST', `/opnames/${encodeURIComponent(id)}/finalize`);

// ---------- Backup ----------

export const exportBackupData = () => request<object>('GET', '/backup');

export const importBackupData = (data: unknown, confirmPassword: string) =>
  request('POST', '/backup/restore', data, { 'X-Confirm-Password': confirmPassword });

export const resetToSeed = (confirmPassword: string) =>
  request('POST', '/backup/reset-demo', undefined, { 'X-Confirm-Password': confirmPassword });

// ---------- Import produk ----------

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
  fitments?: Product['fitments'] | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: Array<{ row: number; message: string }>;
}

export const importProducts = (items: ImportItem[], dryRun: boolean) =>
  request<ImportResult>('POST', '/products/import', { items, dryRun });

// ---------- Laporan & dashboard ----------

export interface DayRow {
  date: string;
  gross_sales: number;
  tx_count: number;
  refunds: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
}

export interface ProductStat {
  product_id: string;
  sold_30d: number;
  sold_90d: number;
  last_sold_at: string | null;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  note?: string;
  created_at: string;
}

export interface PeriodReport {
  from: string;
  to: string;
  summary: {
    gross_sales: number;
    tx_count: number;
    discount_total: number;
    refunds: number;
    net_sales: number;
    cogs: number;
    gross_profit: number;
    gross_margin: number;
    expenses: number;
    net_profit: number;
    damaged_loss: number;
    void_count: number;
    void_total: number;
  };
  daily: DayRow[];
  by_product: Array<{
    product_id: string;
    name: string;
    sku: string;
    category: string;
    qty_sold: number;
    qty_returned: number;
    revenue: number;
    cogs: number;
    profit: number;
    margin: number;
  }>;
  by_category: Array<{ category: string; qty: number; revenue: number; cogs: number; profit: number }>;
  by_payment: Array<{ method: PaymentMethod; tx: number; sales: number; refunds: number; net: number }>;
  purchases: Array<{ number: string; invoice_no: string; supplier_name: string; total: number; outstanding: number; created_at: string }>;
  purchases_by_supplier: Array<{ supplier_id: string; supplier_name: string; invoices: number; total: number; returns: number; outstanding: number }>;
  cash_flow: {
    in_sales: Array<{ method: PaymentMethod; amount: number }>;
    in_supplier_refunds: number;
    out_customer_refunds: number;
    out_supplier_payments: number;
    out_expenses: number;
    total_in: number;
    total_out: number;
    net: number;
  };
  expenses: Expense[];
  expense_by_category: Array<{ category: string; amount: number }>;
}

export interface SnapshotReport {
  today: string;
  dead_stock_days: number;
  debt_aging: Array<{ supplier_id: string; supplier_name: string; current: number; d1_30: number; d31_60: number; d60: number; total: number }>;
  debts: Array<{ supplier_name: string; number: string; invoice_no: string; due_date: string | null; outstanding: number }>;
  inventory: Array<{ product_id: string; sku: string; name: string; category: string; unit: string; stock_qty: number; avg_cost: number; value: number; retail_value: number }>;
  inventory_by_category: Array<{ category: string; sku_count: number; qty: number; value: number; retail_value: number }>;
  movement: Array<{ product_id: string; sku: string; name: string; stock_qty: number; value: number; sold_30d: number; sold_90d: number; last_sold_at: string | null; class: 'fast' | 'slow' | 'dead' | 'normal' }>;
}

export interface DashboardData {
  today: string;
  today_summary: DayRow;
  yesterday_summary: DayRow;
  daily: DayRow[];
  top_products: Array<{ product_id: string; name: string; qty: number; revenue: number }>;
  due_debts: Array<{ id: string; number: string; invoice_no: string; supplier_name: string; due_date: string; outstanding: number }>;
  dead_stock_count: number;
  dead_stock_value: number;
  dead_stock_days: number;
}

export const fetchDashboard = () => request<DashboardData>('GET', '/dashboard');
export const fetchPeriodReport = (from: string, to: string) =>
  request<PeriodReport>('GET', `/reports/period?from=${from}&to=${to}`);
export const fetchSnapshotReport = () => request<SnapshotReport>('GET', '/reports/snapshot');
export const addExpense = (e: { date: string; category: string; amount: number; note?: string }) => request('POST', '/expenses', e);
export const deleteExpense = (id: string) => request('DELETE', `/expenses/${encodeURIComponent(id)}`);

// ---------- Foto & AI ----------

export const uploadProductPhoto = (dataUrl: string) => request<{ url: string }>('POST', '/uploads/product-photo', { dataUrl });

export interface AIReading {
  part_type: string;
  features: string[];
  part_number_ocr: string | null;
  brand?: string | null;
  estimated_motor: string[];
  suggested_keywords: string[];
  raw_description?: string;
}

export interface PhotoSearchResult {
  log_id: string;
  photo_url: string;
  visual: Array<{ product_id: string; score: number }> | null;
  visual_error?: string;
}

export interface PhotoReadResult {
  reading: AIReading | null;
  reading_error?: string;
}

export interface AIStatus {
  gemini: { has_key: boolean; model: string; used_today: number; daily_quota: number };
  vision: { model: string; status: string; error?: string; photos_total: number; photos_indexed: number; photos_pending: number; indexing: boolean };
  accuracy: { searches_30d: number; chosen_30d: number; visual_top5_hits: number };
}

export const fetchAIStatus = () => request<AIStatus>('GET', '/ai/status');
export const photoSearch = (imageBase64: string) => request<PhotoSearchResult>('POST', '/ai/photo-search', { imageBase64 });
export const readSearchPhoto = (logId: string) => request<PhotoReadResult>('POST', `/ai/photo-search/${encodeURIComponent(logId)}/read`);
export const choosePhotoResult = (logId: string, productId: string, saveReference: boolean) =>
  request<{ saved_as_reference: boolean }>('POST', `/ai/photo-search/${encodeURIComponent(logId)}/choose`, {
    product_id: productId,
    save_reference: saveReference,
  });
