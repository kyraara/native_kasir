export type PartType = 'oem' | 'aftermarket' | 'used';

export interface MotorFitment {
  brand: string; // e.g. Honda, Yamaha, Suzuki, Kawasaki
  model: string; // e.g. Beat FI, Vario 125, NMAX, Aerox, Scoopy
  year_from: number;
  year_to: number;
}

export interface Product {
  id: string;
  sku: string;
  part_number: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  part_type: PartType;
  unit: string;
  sell_price: number;
  sell_price_2?: number; // Bengkel / langganan
  avg_cost: number; // Moving average HPP
  stock_qty: number;
  min_stock: number;
  rack_location: string;
  is_active: boolean;
  photos: string[];
  fitments: MotorFitment[];
  created_at: string;
}

export type MovementType =
  | 'sale'
  | 'purchase'
  | 'sale_return'
  | 'purchase_return'
  | 'adjustment'
  | 'opname'
  | 'void';

export interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  type: MovementType;
  qty_change: number; // + or -
  cost_at_time: number;
  balance_after: number;
  ref_number: string;
  note?: string;
  created_at: string;
}

export interface CartItem {
  product: Product;
  qty: number;
  price: number;
  discount: number; // per item in Rp
  cost: number;
}

export interface SaleItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  part_number: string;
  qty: number;
  price: number;
  discount: number;
  cost: number;
}

export type PaymentMethod = 'cash' | 'qris' | 'transfer';

export interface Sale {
  id: string;
  number: string; // e.g. INV-2610-0042
  customer_name?: string;
  vehicle_note?: string;
  subtotal: number;
  discount: number; // total discount
  total: number;
  cost_total: number;
  status: 'paid' | 'void';
  void_reason?: string;
  payment_method: PaymentMethod;
  cash_received?: number;
  change_amount?: number;
  items: SaleItem[];
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  default_term_days: number;
  note?: string;
}

export interface PurchaseItem {
  product_id: string;
  product_name: string;
  qty: number;
  cost: number;
}

export interface Purchase {
  id: string;
  number: string; // e.g. PB-2610-0001
  supplier_id: string;
  supplier_name: string;
  invoice_no: string;
  total: number;
  payment_status: 'paid' | 'credit' | 'partial';
  paid_amount: number;
  /** Nilai retur yang memotong hutang faktur ini */
  returned_amount: number;
  due_date: string;
  items: PurchaseItem[];
  note?: string;
  created_at: string;
}

export interface OpnameItem {
  product_id: string;
  product_name: string;
  rack_location: string;
  system_qty: number;
  counted_qty: number;
  unit_cost: number;
}

export interface OpnameSession {
  id: string;
  number: string; // OPN-2610-001
  scope: 'all' | 'category' | 'rack';
  target_value?: string;
  status: 'open' | 'final';
  started_at: string;
  finalized_at?: string;
  items: OpnameItem[];
}

export interface CustomerRequest {
  id: string;
  description: string;
  photo_url?: string;
  customer_phone?: string;
  status: 'open' | 'ordered' | 'done';
  created_at: string;
}

export interface StoreSettings {
  name: string;
  address: string;
  city: string;
  phone: string;
  wa: string;
  logo_badge: string;
  receipt_header: string;
  receipt_footer: string;
  dead_stock_days: number;
  allow_negative_stock: boolean;
  /** Batas panggilan Gemini per hari (AI-09) */
  ai_daily_quota: number;
  /** Simpan foto pelanggan sebagai referensi saat "Ini barangnya" (AI-06) */
  ai_save_reference: boolean;
  /** Foto QRIS statis toko (dari aplikasi bank/merchant) */
  qris_image_url: string;
  /** Isi teks QRIS statis toko → dipakai membuat QRIS dengan nominal otomatis di kasir */
  qris_payload: string;
  /** Lebar kertas printer thermal */
  receipt_paper: '58' | '80';
  /** Rekening transfer toko yang ditampilkan ke pembeli */
  bank_accounts: Array<{ bank: string; number: string; holder: string }>;
}

export interface AICandidateMatch {
  product: Product;
  match_level: 'Sangat mirip' | 'Mirip' | 'Mungkin';
  confidence_score: number;
  reason: string;
}

export interface SaleReturnItem {
  sale_item_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_refund: number;
  cost: number;
  condition: 'restock' | 'damaged';
}

export interface SaleReturn {
  id: string;
  number: string; // RJ-2610-0001
  sale_id: string;
  sale_number: string;
  refund_amount: number;
  cost_total: number;
  refund_method: PaymentMethod;
  reason: string;
  items: SaleReturnItem[];
  created_at: string;
}

export interface PurchaseReturnItem {
  product_id: string;
  product_name: string;
  qty: number;
  cost: number;
}

export interface PurchaseReturn {
  id: string;
  number: string; // RB-2610-0001
  purchase_id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name: string;
  total: number;
  debt_cut: number;
  refund_amount: number;
  reason: string;
  items: PurchaseReturnItem[];
  created_at: string;
}
