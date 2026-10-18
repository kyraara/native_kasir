import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Camera,
  X,
  Plus,
  Minus,
  Trash2,
  Clock,
  ArrowRight,
  Pause,
  AlertTriangle,
  Package,
  Layers,
  ChevronRight,
  ShoppingCart,
  User,
  Bike,
  Sparkles,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Product, CartItem, Sale, StoreSettings, PaymentMethod } from '../../types';
import { StatusDot, PartTypeBadge } from '../common/Badge';
import { formatRupiah } from '../../utils/pricing';
import { PaymentModal } from './PaymentModal';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { PhotoSearchModal } from './PhotoSearchModal';
import { searchProducts, findByExactCode, listMotors, MotorFilter } from '../../utils/search';
import { MotorChips } from '../common/MotorChips';
import { AppIcon, EmptyState } from '../common/Brand';
import { Mascot } from '../common/Brand';

interface CashierViewProps {
  products: Product[];
  settings: StoreSettings;
  onExitKasir: () => void;
  onProcessSale: (params: {
    customer_name?: string;
    vehicle_note?: string;
    items: CartItem[];
    discount: number;
    payment_method: PaymentMethod;
    cash_received?: number;
    change_amount?: number;
  }) => Promise<Sale>;
  onRequestProduct: (description: string, photoUrl?: string) => void;
}

interface HeldOrder {
  id: string;
  customer: string;
  vehicle?: string;
  cart: CartItem[];
  discount: number;
  time: string;
}

type StoredHeld = Omit<HeldOrder, 'cart'> & {
  cart: Array<{ product_id: string; qty: number; price: number; discount: number }>;
};

const HELD_KEY = 'nm_held_orders_v2';
const ACTIVE_KEY = 'nm_active_cart_v2';

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* penyimpanan browser tidak tersedia — abaikan */
  }
}

const dehydrate = (h: HeldOrder): StoredHeld => ({
  ...h,
  cart: h.cart.map((c) => ({ product_id: c.product.id, qty: c.qty, price: c.price, discount: c.discount })),
});

/** Pasangkan lagi dengan data produk terbaru (stok/HPP terkini); produk yang sudah dihapus/diarsip dibuang. */
function rehydrateCart(items: StoredHeld['cart'], products: Product[]): CartItem[] {
  return items.flatMap((c) => {
    const product = products.find((p) => p.id === c.product_id && p.is_active);
    return product ? [{ product, qty: c.qty, price: c.price, discount: c.discount, cost: product.avg_cost }] : [];
  });
}

export function CashierView({
  products,
  settings,
  onExitKasir,
  onProcessSale,
  onRequestProduct,
}: CashierViewProps) {
  // Mobile / tablet view toggle: 'catalog' | 'order'
  const [mobileView, setMobileView] = useState<'catalog' | 'order'>('catalog');

  // Cashier search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMotor, setSelectedMotor] = useState<MotorFilter | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // AI-10: tombol cari foto mati saat offline
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Produk arsip tidak dijual di kasir
  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const motors = useMemo(() => listMotors(activeProducts), [activeProducts]);

  // Cart & customer state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountTotal, setDiscountTotal] = useState<number>(0);
  const [customerName, setCustomerName] = useState('');
  const [vehicleNote, setVehicleNote] = useState('');

  // Discount input UI toggle
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [discountInputVal, setDiscountInputVal] = useState('0');

  // Held orders (Parkir transaksi) — disimpan di perangkat ini supaya tidak hilang saat refresh (POS-07)
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() =>
    loadLocal<StoredHeld[]>(HELD_KEY, []).map((h) => ({ ...h, cart: rehydrateCart(h.cart, products) })).filter((h) => h.cart.length > 0)
  );

  // Keranjang aktif juga disimpan, supaya refresh tidak menghapus pesanan yang sedang dilayani
  useEffect(() => {
    const saved = loadLocal<StoredHeld | null>(ACTIVE_KEY, null);
    if (saved) {
      setCart(rehydrateCart(saved.cart, products));
      setCustomerName(saved.customer || '');
      setVehicleNote(saved.vehicle || '');
      setDiscountTotal(saved.discount || 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveLocal(HELD_KEY, heldOrders.map(dehydrate));
  }, [heldOrders]);

  useEffect(() => {
    saveLocal(
      ACTIVE_KEY,
      cart.length ? dehydrate({ id: 'active', customer: customerName, vehicle: vehicleNote, cart, discount: discountTotal, time: '' }) : null
    );
  }, [cart, customerName, vehicleNote, discountTotal]);

  // Modals state
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isPhotoSearchOpen, setIsPhotoSearchOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Live clock
  const [currentTime, setCurrentTime] = useState(() =>
    new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date())
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Intl.DateTimeFormat('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date())
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcuts (/ to search, F8 to pay, Ctrl+Esc to exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        setMobileView('catalog');
        searchInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (cart.length > 0) {
          setIsPaymentOpen(true);
        }
      } else if (e.ctrlKey && e.key === 'Escape') {
        e.preventDefault();
        onExitKasir();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, onExitKasir]);

  // Nomor faktur asli dibuat server saat transaksi disimpan
  const activeInvoiceNumber = 'No. otomatis';

  // Filtered products for cashier
  const filteredProducts = useMemo(
    () => searchProducts(activeProducts, searchQuery, { motor: selectedMotor }),
    [activeProducts, searchQuery, selectedMotor]
  );

  // POS-01: scanner barcode mengetik kode lalu Enter → langsung masuk keranjang
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const exact = findByExactCode(activeProducts, searchQuery);
    const target = exact || (filteredProducts.length === 1 ? filteredProducts[0] : undefined);
    if (target) {
      addToCart(target);
      setSearchQuery('');
      setScanNotice(`+1 ${target.name}`);
      setTimeout(() => setScanNotice(null), 1500);
    } else if (searchQuery.trim()) {
      setScanNotice(`Kode "${searchQuery.trim()}" tidak ditemukan`);
      setTimeout(() => setScanNotice(null), 2500);
    }
  };

  // Cart operations
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          product,
          qty: 1,
          price: product.sell_price,
          discount: 0,
          cost: product.avg_cost,
        },
      ];
    });
  };

  const updateCartQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, qty: newQty } : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountTotal(0);
    setDiscountInputVal('0');
    setShowDiscountInput(false);
  };

  // Parkir Transaksi (Hold order)
  const handleHoldOrder = () => {
    if (cart.length === 0) return;
    const held = {
      id: `held-${Date.now()}`,
      customer: customerName.trim() || `Pelanggan #${heldOrders.length + 1}`,
      vehicle: vehicleNote.trim() || undefined,
      cart,
      discount: discountTotal,
      time: currentTime,
    };
    setHeldOrders([held, ...heldOrders]);
    clearCart();
    setCustomerName('');
    setVehicleNote('');
  };

  const handleRestoreHeld = (heldId: string) => {
    const held = heldOrders.find((h) => h.id === heldId);
    if (!held) return;
    let remaining = heldOrders.filter((h) => h.id !== heldId);
    // Pesanan yang sedang dilayani diparkir dulu, jangan ditimpa
    if (cart.length > 0) {
      remaining = [
        {
          id: `held-${Date.now()}`,
          customer: customerName.trim() || `Pelanggan #${remaining.length + 1}`,
          vehicle: vehicleNote.trim() || undefined,
          cart,
          discount: discountTotal,
          time: currentTime,
        },
        ...remaining,
      ];
    }
    setCart(held.cart);
    setCustomerName(held.customer);
    setVehicleNote(held.vehicle || '');
    setDiscountTotal(held.discount || 0);
    setHeldOrders(remaining);
  };

  // Calculations
  const totalCartQty = cart.reduce((acc, it) => acc + it.qty, 0);
  const subtotal = cart.reduce(
    (acc, it) => acc + (it.price * it.qty - it.discount),
    0
  );
  const total = Math.max(0, subtotal - discountTotal);

  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  const handleCompleteSale = async (params: {
    method: PaymentMethod;
    cashReceived?: number;
    changeAmount?: number;
  }) => {
    if (isSubmittingSale) return;
    setIsSubmittingSale(true);
    try {
      const sale = await onProcessSale({
        customer_name: customerName,
        vehicle_note: vehicleNote,
        items: cart,
        discount: discountTotal,
        payment_method: params.method,
        cash_received: params.cashReceived,
        change_amount: params.changeAmount,
      });
      setIsPaymentOpen(false);
      setCompletedSale(sale);
    } catch (err: any) {
      alert(`Transaksi gagal disimpan: ${err?.message || 'kesalahan tidak diketahui'}`);
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const handleNewSale = () => {
    setCompletedSale(null);
    clearCart();
    setCustomerName('');
    setVehicleNote('');
    searchInputRef.current?.focus();
  };

  const handleApplyDiscount = () => {
    const num = parseInt(discountInputVal, 10) || 0;
    setDiscountTotal(Math.min(subtotal, Math.max(0, num)));
    setShowDiscountInput(false);
  };

  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen p-2 sm:p-3 flex flex-col gap-2 sm:gap-3 select-none bg-[#ECEDEF]">
      {/* Top Header Bar */}
      <header className="bg-white rounded-[16px] sm:rounded-[18px] px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between shadow-[0_1px_2px_rgba(17,17,19,0.05)] shrink-0 gap-2">
        {/* Brand & Mode */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <AppIcon size={36} className="w-8 h-8 sm:w-9 sm:h-9 rounded-[10px] shadow-xs" />
          <div className="flex items-center gap-1.5 sm:gap-2 truncate">
            <span className="font-semibold text-xs sm:text-sm text-[#111113] truncate">
              Native Motor
            </span>
            <span className="text-[#A1A1AA] text-xs">/</span>
            <span className="text-[11px] sm:text-xs font-semibold px-2 py-0.5 rounded-[6px] bg-[#F4F4F5] text-[#111113] shrink-0">
              Kasir
            </span>
          </div>
        </div>

        {/* Center / Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Held orders indicator */}
          {heldOrders.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto max-w-[120px] sm:max-w-[240px]">
              {heldOrders.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    handleRestoreHeld(h.id);
                    setMobileView('order');
                  }}
                  className="px-2 py-1 rounded-[8px] bg-[#FEF3C7] text-[#92400E] font-semibold text-[11px] flex items-center gap-1 hover:bg-[#FDE68A] transition-colors shrink-0"
                  title="Klik untuk pulihkan pesanan ini"
                >
                  <Pause size={10} />
                  <span className="max-w-[65px] truncate">{h.customer}</span>
                </button>
              ))}
            </div>
          )}

          {/* Time Clock (Desktop) */}
          <div className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-[10px] bg-[#F4F4F5] font-mono text-xs font-semibold text-[#111113]">
            <Clock size={12} className="text-[#71717A]" />
            <span>{currentTime} WIB</span>
          </div>

          {/* Mobile Cart View Toggle Button */}
          <button
            onClick={() => setMobileView(mobileView === 'catalog' ? 'order' : 'catalog')}
            className={`lg:hidden px-3 py-1.5 rounded-[10px] text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              mobileView === 'order'
                ? 'bg-[#111113] text-[#D4FF3F] border-[#111113]'
                : totalCartQty > 0
                ? 'bg-[#D4FF3F] text-[#111113] border-[#c2ed2e]'
                : 'bg-[#F4F4F5] text-[#111113] border-[#E4E4E7]'
            }`}
          >
            <ShoppingCart size={13} />
            <span>{mobileView === 'order' ? 'Katalog' : `Pesanan (${totalCartQty})`}</span>
          </button>

          {/* Selesai / Exit Kasir */}
          <button
            onClick={onExitKasir}
            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-[10px] sm:rounded-[12px] bg-[#111113] text-white hover:bg-[#27272A] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <span>Selesai</span>
            <kbd className="hidden sm:inline-block text-[10px] font-mono bg-[#2A2A2E] text-[#A1A1AA] px-1.5 py-0.5 rounded">
              Ctrl+Esc
            </kbd>
          </button>
        </div>
      </header>

      {/* Mobile Segmented Switch (Visible only on screens < lg) */}
      <div className="lg:hidden flex rounded-[12px] bg-white p-1 border border-[#E4E4E7] shadow-xs shrink-0">
        <button
          type="button"
          onClick={() => setMobileView('catalog')}
          className={`flex-1 py-2 rounded-[9px] text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
            mobileView === 'catalog'
              ? 'bg-[#111113] text-white shadow-xs'
              : 'text-[#71717A] hover:text-[#111113]'
          }`}
        >
          <Package size={14} />
          <span>Katalog Sparepart</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#2A2A2E] text-white">
            {filteredProducts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMobileView('order')}
          className={`flex-1 py-2 rounded-[9px] text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
            mobileView === 'order'
              ? 'bg-[#111113] text-[#D4FF3F] shadow-xs'
              : 'text-[#71717A] hover:text-[#111113]'
          }`}
        >
          <ShoppingCart size={14} />
          <span>Keranjang Pesanan</span>
          {totalCartQty > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#D4FF3F] text-[#111113] font-bold">
              {totalCartQty}
            </span>
          )}
        </button>
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3 min-h-0 overflow-hidden">
        {/* ========================================================
            LEFT COLUMN: Product Catalog & Search
            (Visible on desktop always; on mobile only when mobileView === 'catalog')
           ======================================================== */}
        <div
          className={`${
            mobileView === 'catalog' ? 'flex' : 'hidden lg:flex'
          } ${
            cart.length === 0 ? 'lg:col-span-7 xl:col-span-8' : 'lg:col-span-7 xl:col-span-8'
          } panel p-3 sm:p-4 md:p-5 flex-col gap-3 overflow-hidden h-full`}
        >
          {/* Search Input Bar with AI Camera Trigger */}
          <div className="relative flex items-center shrink-0">
            <Search
              size={18}
              className="absolute left-3.5 sm:left-4 text-[#71717A] pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              autoFocus
              placeholder="Cari / scan barcode, mis. kampas beat 2018 (/)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full h-11 sm:h-13 pl-10 sm:pl-11 pr-28 sm:pr-40 rounded-[12px] sm:rounded-[14px] bg-[#F4F4F5] text-xs sm:text-sm font-medium text-[#111113] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#111113] transition-all"
            />

            <div className="absolute right-2 flex items-center gap-1 sm:gap-1.5">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-[#71717A] hover:text-[#111113]"
                  title="Hapus pencarian"
                >
                  <X size={15} />
                </button>
              )}

              {/* "Cari pakai foto" Button */}
              <button
                type="button"
                onClick={() => setIsPhotoSearchOpen(true)}
                disabled={!isOnline}
                className="h-8 sm:h-9 px-2 sm:px-3 rounded-[9px] sm:rounded-[10px] bg-[#111113] text-white hover:bg-[#27272A] text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs group shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                title={isOnline ? 'Cari pakai foto part' : 'Offline — cari pakai foto butuh internet. Pencarian teks tetap jalan.'}
              >
                <Camera size={13} className="group-hover:text-[#D4FF3F] transition-colors" />
                <span className="hidden sm:inline">{isOnline ? 'Cari foto' : 'Offline'}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-[#D4FF3F]' : 'bg-[#DC2626]'}`} />
              </button>
            </div>
          </div>

          {/* Motor Filter Chips */}
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-none">
            <span className="text-[11px] font-semibold text-[#71717A] shrink-0 mr-0.5">
              Motor:
            </span>
            <MotorChips motors={motors} value={selectedMotor} onChange={setSelectedMotor} maxChips={7} size="sm" />
          </div>

          {scanNotice && (
            <div className="shrink-0 px-3 py-1.5 rounded-[10px] bg-[#111113] text-[#D4FF3F] text-xs font-semibold">
              {scanNotice}
            </div>
          )}

          {/* Product Results List (Scrollable, Responsive Cards) */}
          <div className="flex-1 overflow-y-auto pr-0.5 sm:pr-1 flex flex-col gap-2 min-h-0 pb-16 lg:pb-0">
            {filteredProducts.length === 0 ? (
              <EmptyState
                mascot="pencarian-kosong"
                title="Tidak ada produk ditemukan"
                description='Coba kata kunci lain, atau pakai tombol "Cari foto" kalau pembeli membawa foto/part bekas.'
              />
            ) : (
              filteredProducts.map((prod) => {
                const inCart = cart.find((it) => it.product.id === prod.id);
                const status =
                  prod.stock_qty <= 0
                    ? 'out'
                    : prod.stock_qty <= prod.min_stock
                    ? 'low'
                    : 'safe';

                return (
                  <div
                    key={prod.id}
                    className={`p-2.5 sm:p-3 rounded-[14px] bg-[#F9FAFB] hover:bg-[#F4F4F5] border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                      inCart ? 'bg-[#F4F4F5] border-[#D4D4D8]' : 'border-transparent hover:border-[#E4E4E7]'
                    }`}
                  >
                    {/* Top on mobile / Left on desktop: Image + Details */}
                    <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      {/* Photo Thumbnail */}
                      <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-[10px] sm:rounded-[12px] bg-white border border-[#E4E4E7] overflow-hidden shrink-0 flex items-center justify-center">
                        {prod.photos && prod.photos[0] ? (
                          <img
                            src={prod.photos[0]}
                            alt={prod.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package size={20} className="text-[#A1A1AA]" />
                        )}
                      </div>

                      {/* Info Container */}
                      <div className="min-w-0 flex-1">
                        {/* Meta Tags: Type, Part Number, Rack */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <PartTypeBadge type={prod.part_type} />
                          <span className="font-mono text-[10px] sm:text-[11px] text-[#71717A] truncate">
                            {prod.part_number || prod.sku}
                          </span>
                          <span className="text-[10px] sm:text-[11px] font-mono text-[#71717A]">
                            · Rak: <strong className="font-semibold text-[#111113]">{prod.rack_location}</strong>
                          </span>
                        </div>

                        {/* Product Title (2 lines on mobile, readable) */}
                        <h4 className="font-semibold text-xs sm:text-sm text-[#111113] leading-snug line-clamp-2">
                          {prod.name}
                        </h4>

                        {/* Status & Fitment */}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <StatusDot
                            status={status}
                            text={
                              status === 'out'
                                ? 'Habis (0)'
                                : status === 'low'
                                ? `Sisa ${prod.stock_qty}`
                                : `Stok ${prod.stock_qty}`
                            }
                          />
                          {prod.fitments[0] && (
                            <span className="text-[10px] text-[#6E6E76] truncate">
                              · Cocok: {prod.fitments[0].model}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom on mobile / Right on desktop: Price & Add/Stepper */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#ECECED] shrink-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-[#71717A] sm:hidden block">Harga</span>
                        <div className="text-sm sm:text-base font-bold font-mono text-[#111113] num">
                          {formatRupiah(prod.sell_price)}
                        </div>
                      </div>

                      {/* Interactive Add or Inline Stepper */}
                      {inCart ? (
                        <div className="flex items-center gap-1 bg-[#111113] p-1 rounded-[10px] text-white">
                          <button
                            type="button"
                            onClick={() => updateCartQty(prod.id, inCart.qty - 1)}
                            className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#2A2A2E] transition-colors"
                            title="Kurang 1"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="w-6 text-center font-mono font-bold text-xs text-[#D4FF3F] num">
                            {inCart.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(prod.id, inCart.qty + 1)}
                            className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#2A2A2E] transition-colors"
                            title="Tambah 1"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(prod)}
                          className="h-8 sm:h-9 px-3 sm:px-3.5 rounded-[10px] bg-[#111113] text-white hover:bg-[#27272A] font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
                          title="Tambah ke Pesanan"
                        >
                          <Plus size={14} />
                          <span>Tambah</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================
            RIGHT COLUMN: Black Order Panel (`aside`)
            (Visible on desktop always; on mobile only when mobileView === 'order')
            - Refactored so when `cart.length === 0`, it does NOT stretch
              awkwardly full-height with empty "TOTAL Rp 0" and dead buttons!
           ======================================================== */}
        <aside
          className={`${
            mobileView === 'order' ? 'flex' : 'hidden lg:flex'
          } lg:col-span-5 xl:col-span-4 panel-ink p-3.5 sm:p-5 flex-col justify-between overflow-hidden shadow-[0_24px_48px_-24px_rgba(17,17,19,0.45)] h-full`}
        >
          <div className="flex flex-col gap-3 min-h-0 flex-1 overflow-hidden">
            {/* Header: Order Info & Actions */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#2A2A2E] shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm sm:text-base text-white">
                  {cart.length > 0 ? 'Pesanan Aktif' : 'Pesanan Baru'}
                </span>
                <span className="font-mono text-xs text-[#A1A1AA]">
                  {activeInvoiceNumber}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {cart.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleHoldOrder}
                      title="Tahan Pesanan (Parkir)"
                      className="px-2.5 py-1 rounded-[7px] bg-[#1C1C1F] hover:bg-[#2A2A2E] text-[#A1A1AA] hover:text-white text-[11px] font-medium flex items-center gap-1 transition-colors"
                    >
                      <Pause size={11} />
                      <span>Parkir</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearCart}
                      title="Kosongkan Pesanan"
                      className="p-1.5 rounded-[7px] bg-[#1C1C1F] hover:bg-[#2A2A2E] text-[#F87171] transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Quick Customer & Vehicle Fields */}
            <div className="p-2.5 rounded-[12px] bg-[#141416] border border-[#2A2A2E] flex flex-col gap-2 shrink-0 text-xs">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[#A1A1AA] w-20 shrink-0">
                  <User size={12} />
                  <span className="text-[11px]">Pembeli</span>
                </div>
                <input
                  type="text"
                  placeholder="Umum / Nama Pembeli"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="flex-1 px-2.5 py-1 rounded-[6px] bg-[#1C1C1F] text-white placeholder-[#71717A] text-xs outline-none focus:ring-1 focus:ring-[#D4FF3F] border border-transparent font-medium"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[#A1A1AA] w-20 shrink-0">
                  <Bike size={12} />
                  <span className="text-[11px]">Motor/Plat</span>
                </div>
                <input
                  type="text"
                  placeholder="misal: Beat FI / B 1234 ABC"
                  value={vehicleNote}
                  onChange={(e) => setVehicleNote(e.target.value)}
                  className="flex-1 px-2.5 py-1 rounded-[6px] bg-[#1C1C1F] text-white placeholder-[#71717A] text-xs outline-none focus:ring-1 focus:ring-[#D4FF3F] border border-transparent font-medium"
                />
              </div>
            </div>

            {/* Cart Items List OR Clean, Balanced Empty State */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 min-h-0">
              {cart.length === 0 ? (
                /* Sleek Empty State: No awkward giant zero void */
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#A1A1AA] gap-3">
                  <Mascot name="keranjang-kosong" size={96} />

                  <div>
                    <h5 className="text-xs sm:text-sm font-semibold text-white">
                      Keranjang Siap
                    </h5>
                    <p className="text-[11px] text-[#A1A1AA] mt-1 max-w-[240px] leading-relaxed">
                      Pilih barang di sebelah kiri dengan tombol <strong className="text-white">+ Tambah</strong> atau tekan <kbd className="font-mono text-white bg-[#2A2A2E] px-1 rounded">/</kbd> untuk mencari.
                    </p>
                  </div>

                  {/* Quick Shortcut Pills */}
                  <div className="mt-1 p-2 rounded-[10px] bg-[#141416] border border-[#2A2A2E] text-[10px] text-[#A1A1AA] flex flex-wrap items-center justify-center gap-1.5 max-w-[260px]">
                    <span className="font-mono bg-[#2A2A2E] text-white px-1.5 py-0.5 rounded">/</span> Cari
                    <span className="text-[#3F3F46]">·</span>
                    <span className="font-mono bg-[#2A2A2E] text-white px-1.5 py-0.5 rounded">F8</span> Bayar
                    <span className="text-[#3F3F46]">·</span>
                    <span className="font-mono bg-[#2A2A2E] text-white px-1.5 py-0.5 rounded">Ctrl+Esc</span> Admin
                  </div>

                  {/* Switch to Catalog Button on Mobile */}
                  <button
                    type="button"
                    onClick={() => setMobileView('catalog')}
                    className="lg:hidden mt-2 px-4 py-2 rounded-[10px] bg-[#D4FF3F] text-[#111113] font-bold text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <Package size={14} />
                    <span>Pilih Sparepart Sekarang</span>
                  </button>
                </div>
              ) : (
                /* Active Cart Items */
                cart.map((item) => {
                  const isLowStock = item.product.stock_qty <= 0;

                  return (
                    <div
                      key={item.product.id}
                      className="p-2.5 rounded-[12px] bg-[#1C1C1F] border border-[#2A2A2E] flex flex-col gap-1.5 text-xs shrink-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white truncate leading-tight">
                            {item.product.name}
                          </p>
                          <p className="text-[10px] text-[#A1A1AA] font-mono mt-0.5">
                            @ {formatRupiah(item.price, false)} · Rak {item.product.rack_location}
                          </p>
                        </div>

                        {/* Line subtotal */}
                        <span className="font-mono font-bold text-white text-xs sm:text-sm num shrink-0">
                          {formatRupiah(item.price * item.qty - item.discount, false)}
                        </span>
                      </div>

                      {/* Stock warning */}
                      {isLowStock && (
                        <div className="flex items-center gap-1 text-[10px] text-[#FBBF24]">
                          <AlertTriangle size={11} />
                          <span>Stok fisik tercatat 0</span>
                        </div>
                      )}

                      {/* Controls */}
                      <div className="flex items-center justify-between pt-1 border-t border-[#2A2A2E]">
                        <div className="flex items-center gap-1 bg-[#111113] p-0.5 rounded-[8px] border border-[#2A2A2E]">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.product.id, item.qty - 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#1C1C1F] transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-7 text-center font-mono font-bold text-white num text-xs">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.product.id, item.qty + 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#1C1C1F] transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-[#71717A] hover:text-[#F87171] p-1 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ========================================================
              BOTTOM TOTALS & ACTIONS
              - When cart is empty: clean, compact helper summary (NOT a giant disabled Rp 0 wall!)
              - When cart has items: full checkout with totals & Lime Pay button
             ======================================================== */}
          {cart.length === 0 ? (
            /* Compact empty footer instead of massive Rp 0 wall */
            <div className="pt-2.5 border-t border-[#2A2A2E] mt-2 flex items-center justify-between text-xs text-[#71717A] shrink-0">
              <span className="text-[11px]">0 item dipilih</span>
              <span className="text-[11px] font-mono text-[#A1A1AA]">Total: Rp 0</span>
            </div>
          ) : (
            /* Active checkout section */
            <div className="pt-2.5 border-t border-[#2A2A2E] mt-2 flex flex-col gap-2 shrink-0">
              {/* Subtotal & Discount toggle */}
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between text-[#A1A1AA]">
                  <span>Subtotal ({totalCartQty} item)</span>
                  <span className="font-mono num">{formatRupiah(subtotal)}</span>
                </div>

                {discountTotal > 0 && (
                  <div className="flex justify-between text-[#F87171]">
                    <span>Diskon</span>
                    <span className="font-mono num">-{formatRupiah(discountTotal)}</span>
                  </div>
                )}

                {/* Quick discount input button */}
                {!showDiscountInput ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountInputVal(String(discountTotal));
                      setShowDiscountInput(true);
                    }}
                    className="text-[11px] text-[#A1A1AA] hover:text-[#D4FF3F] text-left underline underline-offset-2 w-fit mt-0.5"
                  >
                    {discountTotal > 0 ? 'Ubah diskon' : '+ Beri Diskon'}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1 bg-[#141416] p-1.5 rounded-[8px] border border-[#2A2A2E]">
                    <span className="text-[10px] text-[#A1A1AA]">Rp</span>
                    <input
                      type="number"
                      value={discountInputVal}
                      onChange={(e) => setDiscountInputVal(e.target.value)}
                      placeholder="Nominal diskon"
                      className="w-full bg-[#1C1C1F] px-2 py-1 rounded text-white text-xs font-mono outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleApplyDiscount}
                      className="px-2 py-1 rounded bg-[#D4FF3F] text-[#111113] font-bold text-[10px]"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDiscountInput(false)}
                      className="p-1 text-[#71717A] hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Total Display */}
              <div>
                <span className="text-[10px] text-[#A1A1AA] uppercase font-semibold tracking-wider">
                  Total Pembelian
                </span>
                <div className="text-2xl sm:text-3xl font-semibold text-white tracking-tight font-mono num leading-tight mt-0.5">
                  {formatRupiah(total)}
                </div>
              </div>

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={() => setIsPaymentOpen(true)}
                className="w-full h-11 sm:h-12 rounded-[12px] bg-[#D4FF3F] hover:bg-[#c2ed2e] text-[#111113] font-bold text-sm sm:text-base flex items-center justify-between px-4 transition-all shadow-lg active:scale-98"
              >
                <span>Bayar Sekarang</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs sm:text-sm">
                    {formatRupiah(total, false)}
                  </span>
                  <kbd className="font-mono text-[10px] bg-[#111113] text-[#D4FF3F] px-1.5 py-0.5 rounded-[5px]">
                    F8
                  </kbd>
                </div>
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* ========================================================
          MOBILE FLOATING ACTION BAR:
          When on mobile catalog view and items are in cart,
          show a sticky bottom pill to jump to payment or view order.
         ======================================================== */}
      {mobileView === 'catalog' && totalCartQty > 0 && (
        <div className="lg:hidden fixed bottom-3 left-3 right-3 bg-[#0E0E10] text-[#F4F4F5] p-2.5 sm:p-3 rounded-[16px] shadow-[0_16px_36px_rgba(0,0,0,0.5)] z-40 flex items-center justify-between border border-[#2A2A2E] animate-in slide-in-from-bottom duration-200">
          <button
            type="button"
            onClick={() => setMobileView('order')}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="w-8 h-8 rounded-[9px] bg-[#1C1C1F] border border-[#2A2A2E] flex items-center justify-center font-mono font-bold text-xs text-[#D4FF3F]">
              {totalCartQty}
            </div>
            <div>
              <span className="text-[10px] text-[#A1A1AA] block leading-tight">Lihat Pesanan</span>
              <span className="font-mono font-bold text-xs sm:text-sm text-white num leading-tight">
                {formatRupiah(total)}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setIsPaymentOpen(true)}
            className="px-4 py-2 rounded-[10px] bg-[#D4FF3F] text-[#111113] font-bold text-xs shadow-md active:scale-95 transition-transform"
          >
            Bayar ({totalCartQty})
          </button>
        </div>
      )}

      {/* Payment Screen Modal */}
      {isPaymentOpen && (
        <PaymentModal
          items={cart}
          subtotal={subtotal}
          discount={discountTotal}
          total={total}
          invoiceNumber={activeInvoiceNumber}
          customerName={customerName}
          vehicleNote={vehicleNote}
          onChangeCustomerName={setCustomerName}
          onChangeVehicleNote={setVehicleNote}
          settings={settings}
          onClose={() => setIsPaymentOpen(false)}
          onCompleteSale={handleCompleteSale}
        />
      )}

      {/* Thermal Receipt Modal (58mm) */}
      {completedSale && (
        <ThermalReceiptModal
          sale={completedSale}
          settings={settings}
          onClose={() => setCompletedSale(null)}
          onNewSale={handleNewSale}
        />
      )}

      {/* Cari Pakai Foto Modal */}
      {isPhotoSearchOpen && (
        <PhotoSearchModal
          products={activeProducts}
          settings={settings}
          onClose={() => setIsPhotoSearchOpen(false)}
          onAddToCart={addToCart}
          onRequestProduct={onRequestProduct}
        />
      )}
    </div>
  );
}
