-- Native Motor — skema MySQL 8
-- Semua nominal uang dalam Rupiah (bilangan bulat).
-- stock_qty & avg_cost di `products` HANYA diubah oleh server/stock.ts
-- di dalam transaksi database, yang sekaligus menulis `stock_movements`.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  sku           VARCHAR(60)  NOT NULL,
  part_number   VARCHAR(80)  NOT NULL DEFAULT '',
  barcode       VARCHAR(80)  NOT NULL DEFAULT '',
  name          VARCHAR(200) NOT NULL,
  brand         VARCHAR(120) NOT NULL DEFAULT '',
  category      VARCHAR(120) NOT NULL DEFAULT '',
  part_type     ENUM('oem','aftermarket','used') NOT NULL DEFAULT 'aftermarket',
  unit          VARCHAR(20)  NOT NULL DEFAULT 'pcs',
  sell_price    BIGINT       NOT NULL DEFAULT 0,
  sell_price_2  BIGINT       NULL,
  avg_cost      BIGINT       NOT NULL DEFAULT 0,
  stock_qty     INT          NOT NULL DEFAULT 0,
  min_stock     INT          NOT NULL DEFAULT 0,
  rack_location VARCHAR(64)  NOT NULL DEFAULT '',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_barcode (barcode),
  KEY idx_products_part_number (part_number),
  FULLTEXT KEY ft_products (name, brand, part_number, sku, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_fitments (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id  VARCHAR(64) NOT NULL,
  brand       VARCHAR(60) NOT NULL,
  model       VARCHAR(120) NOT NULL,
  year_from   SMALLINT NOT NULL,
  year_to     SMALLINT NOT NULL,
  KEY idx_fit_product (product_id),
  KEY idx_fit_model (brand, model),
  CONSTRAINT fk_fit_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_photos (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id  VARCHAR(64) NOT NULL,
  sort_order  TINYINT NOT NULL DEFAULT 0,
  url         MEDIUMTEXT NOT NULL, -- sementara data URL; Fase 5 pindah ke file storage
  KEY idx_photo_product (product_id),
  CONSTRAINT fk_photo_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id                VARCHAR(64)  NOT NULL PRIMARY KEY,
  name              VARCHAR(150) NOT NULL,
  phone             VARCHAR(64)  NOT NULL DEFAULT '',
  address           VARCHAR(255) NOT NULL DEFAULT '',
  default_term_days INT          NOT NULL DEFAULT 0,
  note              VARCHAR(255) NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales (
  id             VARCHAR(64) NOT NULL PRIMARY KEY,
  number         VARCHAR(30) NOT NULL,
  customer_name  VARCHAR(120) NULL,
  vehicle_note   VARCHAR(120) NULL,
  subtotal       BIGINT NOT NULL,
  discount       BIGINT NOT NULL DEFAULT 0,
  total          BIGINT NOT NULL,
  cost_total     BIGINT NOT NULL,
  status         ENUM('paid','void') NOT NULL DEFAULT 'paid',
  void_reason    VARCHAR(255) NULL,
  payment_method ENUM('cash','qris','transfer') NOT NULL,
  cash_received  BIGINT NULL,
  change_amount  BIGINT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sales_number (number),
  KEY idx_sales_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_items (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  sale_id      VARCHAR(64) NOT NULL,
  product_id   VARCHAR(64) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  sku          VARCHAR(60) NOT NULL,
  part_number  VARCHAR(80) NOT NULL DEFAULT '',
  qty          INT NOT NULL,
  price        BIGINT NOT NULL,
  discount     BIGINT NOT NULL DEFAULT 0,
  cost         BIGINT NOT NULL,
  KEY idx_si_sale (sale_id),
  KEY idx_si_product (product_id),
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchases (
  id             VARCHAR(64) NOT NULL PRIMARY KEY,
  number         VARCHAR(30) NOT NULL,
  supplier_id    VARCHAR(64) NOT NULL,
  supplier_name  VARCHAR(150) NOT NULL,
  invoice_no     VARCHAR(60) NOT NULL DEFAULT '',
  total          BIGINT NOT NULL,
  payment_status ENUM('paid','credit','partial') NOT NULL,
  paid_amount    BIGINT NOT NULL DEFAULT 0,
  due_date       DATE NULL,
  note           VARCHAR(255) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_purchases_number (number),
  KEY idx_pur_supplier (supplier_id),
  KEY idx_pur_due (payment_status, due_date),
  CONSTRAINT fk_pur_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_items (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  purchase_id  VARCHAR(64) NOT NULL,
  product_id   VARCHAR(64) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  qty          INT NOT NULL,
  cost         BIGINT NOT NULL,
  KEY idx_pi_purchase (purchase_id),
  CONSTRAINT fk_pi_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_payments (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  purchase_id VARCHAR(64) NOT NULL,
  amount      BIGINT NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_sp_purchase (purchase_id),
  CONSTRAINT fk_sp_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_movements (
  id            VARCHAR(64) NOT NULL PRIMARY KEY,
  product_id    VARCHAR(64) NOT NULL,
  product_name  VARCHAR(200) NOT NULL,
  type          ENUM('sale','purchase','sale_return','purchase_return','adjustment','opname','void') NOT NULL,
  qty_change    INT NOT NULL,
  cost_at_time  BIGINT NOT NULL,
  balance_after INT NOT NULL,
  ref_number    VARCHAR(64) NOT NULL,
  note          VARCHAR(255) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_mov_product (product_id, created_at),
  KEY idx_mov_created (created_at),
  CONSTRAINT fk_mov_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opname_sessions (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  number       VARCHAR(30) NOT NULL,
  scope        ENUM('all','category','rack') NOT NULL,
  target_value VARCHAR(120) NULL,
  status       ENUM('open','final') NOT NULL DEFAULT 'open',
  started_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finalized_at DATETIME(3) NULL,
  UNIQUE KEY uq_opname_number (number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opname_items (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id    VARCHAR(64) NOT NULL,
  product_id    VARCHAR(64) NOT NULL,
  product_name  VARCHAR(200) NOT NULL,
  rack_location VARCHAR(64) NOT NULL DEFAULT '',
  system_qty    INT NOT NULL,
  counted_qty   INT NOT NULL,
  unit_cost     BIGINT NOT NULL,
  KEY idx_oi_session (session_id),
  CONSTRAINT fk_oi_session FOREIGN KEY (session_id) REFERENCES opname_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_requests (
  id             VARCHAR(64) NOT NULL PRIMARY KEY,
  description    VARCHAR(500) NOT NULL,
  photo_url      MEDIUMTEXT NULL,
  customer_phone VARCHAR(64) NULL,
  status         ENUM('open','ordered','done') NOT NULL DEFAULT 'open',
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Satu baris pengaturan toko (id = 1), disimpan sebagai JSON
CREATE TABLE IF NOT EXISTS store_settings (
  id   TINYINT NOT NULL PRIMARY KEY,
  data JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Penomoran dokumen per bulan (INV-2610-0001, PB-2610-0001, OPN-2610-001)
CREATE TABLE IF NOT EXISTS doc_counters (
  prefix  VARCHAR(10) NOT NULL,
  period  CHAR(4)     NOT NULL,
  last_no INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Retur (Fase 3) ----------

-- Retur penjualan (POS-10). Barang 'restock' kembali ke stok, 'damaged' tidak.
CREATE TABLE IF NOT EXISTS sale_returns (
  id             VARCHAR(64) NOT NULL PRIMARY KEY,
  number         VARCHAR(30) NOT NULL,
  sale_id        VARCHAR(64) NOT NULL,
  sale_number    VARCHAR(30) NOT NULL,
  refund_amount  BIGINT NOT NULL,
  cost_total     BIGINT NOT NULL,
  refund_method  ENUM('cash','qris','transfer') NOT NULL DEFAULT 'cash',
  reason         VARCHAR(255) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sr_number (number),
  KEY idx_sr_sale (sale_id),
  KEY idx_sr_created (created_at),
  CONSTRAINT fk_sr_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_return_items (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_id     VARCHAR(64) NOT NULL,
  sale_item_id  VARCHAR(64) NOT NULL,
  product_id    VARCHAR(64) NOT NULL,
  product_name  VARCHAR(200) NOT NULL,
  qty           INT NOT NULL,
  unit_refund   BIGINT NOT NULL,
  cost          BIGINT NOT NULL,
  item_condition ENUM('restock','damaged') NOT NULL,
  KEY idx_sri_return (return_id),
  KEY idx_sri_sale_item (sale_item_id),
  CONSTRAINT fk_sri_return FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_sri_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retur pembelian ke supplier (BLI-10): memotong hutang faktur, sisanya refund
CREATE TABLE IF NOT EXISTS purchase_returns (
  id             VARCHAR(64) NOT NULL PRIMARY KEY,
  number         VARCHAR(30) NOT NULL,
  purchase_id    VARCHAR(64) NOT NULL,
  purchase_number VARCHAR(30) NOT NULL,
  supplier_id    VARCHAR(64) NOT NULL,
  supplier_name  VARCHAR(150) NOT NULL,
  total          BIGINT NOT NULL,
  debt_cut       BIGINT NOT NULL DEFAULT 0,
  refund_amount  BIGINT NOT NULL DEFAULT 0,
  reason         VARCHAR(255) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pr_number (number),
  KEY idx_pr_purchase (purchase_id),
  CONSTRAINT fk_pr_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_id    VARCHAR(64) NOT NULL,
  product_id   VARCHAR(64) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  qty          INT NOT NULL,
  cost         BIGINT NOT NULL,
  KEY idx_pri_return (return_id),
  CONSTRAINT fk_pri_return FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_pri_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Biaya operasional (Fase 4) ----------
CREATE TABLE IF NOT EXISTS expenses (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  expense_date DATE        NOT NULL, -- tanggal di zona waktu toko
  category    VARCHAR(80)  NOT NULL,
  amount      BIGINT       NOT NULL,
  note        VARCHAR(255) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_exp_date (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Foto & AI (Fase 5) ----------

-- Log cari pakai foto (AI-07). Foto pelanggan dihapus otomatis setelah 30 hari.
CREATE TABLE IF NOT EXISTS photo_search_logs (
  id            VARCHAR(64) NOT NULL PRIMARY KEY,
  photo_path    VARCHAR(255) NULL,
  ai_reading    JSON NULL,
  ai_source     VARCHAR(40) NOT NULL,
  candidates    JSON NULL,
  chosen_product_id VARCHAR(64) NULL,
  saved_as_reference TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  chosen_at     DATETIME(3) NULL,
  KEY idx_psl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pemakaian Gemini per hari (AI-09)
CREATE TABLE IF NOT EXISTS ai_usage (
  usage_date DATE NOT NULL PRIMARY KEY,
  calls      INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
