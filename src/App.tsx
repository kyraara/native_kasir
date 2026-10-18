/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from './components/layout/AdminSidebar';
import { DashboardView } from './components/admin/DashboardView';
import { ProductsView } from './components/admin/ProductsView';
import { StockView } from './components/admin/StockView';
import { PurchasesView } from './components/admin/PurchasesView';
import { OpnameView } from './components/admin/OpnameView';
import { ReportsView, ReportTab } from './components/admin/ReportsView';
import { SettingsView } from './components/admin/SettingsView';
import { CashierView } from './components/kasir/CashierView';
import { SalesHistoryView } from './components/admin/SalesHistoryView';
import { LabelPrintView } from './components/admin/LabelPrintView';
import { LoginScreen, FullScreenMessage } from './components/layout/LoginScreen';
import * as api from './utils/api';
import * as offline from './utils/offline';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { defaultStoreSettings } from './data/mockData';
import {
  Product,
  Sale,
  Supplier,
  Purchase,
  StockMovement,
  StoreSettings,
  OpnameSession,
  SaleReturn,
  PurchaseReturn,
  CustomerRequest,
} from './types';
import {
  ShoppingBag,
  LayoutDashboard,
  Package,
  Truck,
  Layers,
  CreditCard,
  Menu,
  X,
  MoreHorizontal,
  ClipboardList,
  BarChart3,
  Receipt,
  Settings,
  Database,
  TrendingUp,
  Building2,
  History,
  Barcode,
} from 'lucide-react';
import { AppIcon } from './components/common/Brand';

export default function App() {
  const [mode, setMode] = useState<'admin' | 'kasir'>(() => {
    return window.location.pathname === '/kasir' || window.location.hash === '#kasir'
      ? 'kasir'
      : 'admin';
  });

  const [adminTab, setAdminTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Auth & loading
  const [authState, setAuthState] = useState<'checking' | 'guest' | 'authed'>('checking');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Database state (dimuat dari server MySQL)
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [settings, setSettingsState] = useState<StoreSettings>(defaultStoreSettings);
  const [opnames, setOpnames] = useState<OpnameSession[]>([]);
  const [productStats, setProductStats] = useState<api.ProductStat[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  // Naik setiap data dimuat ulang; dipakai dashboard untuk ikut memperbarui angkanya
  const [dataVersion, setDataVersion] = useState(0);
  const [reportTab, setReportTab] = useState<ReportTab>('summary');
  // Mode offline: waktu salinan data yang sedang dipakai (null = online) & antrean transaksi
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [saleQueue, setSaleQueue] = useState<offline.QueuedSale[]>([]);
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);

  // Cross-navigation state
  const [selectedProductForStock, setSelectedProductForStock] = useState<Product | null>(null);
  const [stockSubTab, setStockSubTab] = useState<'card' | 'restock' | 'adjust'>('card');
  const [purchasesSubTab, setPurchasesSubTab] = useState<'receiving' | 'suppliers' | 'debts' | 'history'>('receiving');
  const [prefilledPurchaseItem, setPrefilledPurchaseItem] = useState<{
    product: Product;
    qty: number;
  } | null>(null);

  const applyData = useCallback((data: api.AppData) => {
    setProducts(data.products);
      setSales(data.sales);
      setSuppliers(data.suppliers);
      setPurchases(data.purchases);
      setMovements(data.movements);
      setSettingsState(data.settings);
      setOpnames(data.opnames);
      setSaleReturns(data.sale_returns);
      setPurchaseReturns(data.purchase_returns);
      setProductStats(data.product_stats);
    setRequests(data.requests);
    setDataVersion((v) => v + 1);
    setIsLoaded(true);
  }, []);

  /** Kirim antrean transaksi offline; jika ada yang terkirim, muat ulang data */
  const syncNow = useCallback(async () => {
    const res = await offline.syncQueue(api.sendQueuedSale);
    return res.sent;
  }, []);

  // Muat ulang semua data dari server (atau salinan tersimpan saat offline)
  const refreshData = useCallback(async () => {
    try {
      // Kirim antrean offline dulu supaya data yang dimuat sudah termasuk transaksinya
      if (navigator.onLine && (await offline.getQueue()).some((q) => !q.error)) await syncNow();
      const data = await api.fetchAll();
      applyData(data);
      offline.saveSnapshot(data);
      setOfflineSince(null);
      setLoadError(null);
    } catch (err: any) {
      if (err?.status === 0) {
        const snap = await offline.loadSnapshot();
        if (snap) {
          // Kurangi stok dengan transaksi offline yang belum terkirim
          const sold = new Map<string, number>();
          for (const q of await offline.getQueue())
            for (const i of q.params.items) sold.set(i.product_id, (sold.get(i.product_id) || 0) + i.qty);
          applyData({
            ...snap.data,
            products: snap.data.products.map((p) => (sold.has(p.id) ? { ...p, stock_qty: p.stock_qty - sold.get(p.id)! } : p)),
          });
          setOfflineSince(snap.saved_at);
          setLoadError(null);
          return;
        }
      }
      setLoadError(err?.message || 'Gagal memuat data');
    }
  }, [applyData, syncNow]);

  // Pantau antrean & koneksi: begitu online, kirim antrean lalu segarkan data
  useEffect(() => {
    offline.getQueue().then(setSaleQueue);
    const onQueue = (e: Event) => setSaleQueue((e as CustomEvent).detail);
    const onOnline = () => refreshData();
    window.addEventListener('nm-queue-changed', onQueue);
    window.addEventListener('online', onOnline);
    const timer = setInterval(async () => {
      if (navigator.onLine && (await offline.getQueue()).some((q) => !q.error)) refreshData();
    }, 30000);
    return () => {
      window.removeEventListener('nm-queue-changed', onQueue);
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [refreshData]);

  useEffect(() => {
    // Offline tapi pernah login di perangkat ini → tetap masuk memakai data tersimpan
    api.checkSession().then((s) => setAuthState(s === 'invalid' ? 'guest' : 'authed'));
    const onLogout = () => {
      setAuthState('guest');
      setIsLoaded(false);
    };
    api.authEvents.addEventListener('logout', onLogout);
    return () => api.authEvents.removeEventListener('logout', onLogout);
  }, []);

  useEffect(() => {
    if (authState === 'authed') refreshData();
  }, [authState, refreshData]);

  /** Jalankan aksi ke server, tampilkan pesan jika gagal, lalu muat ulang data. */
  const run = async (action: () => Promise<unknown>, reload = true): Promise<boolean> => {
    try {
      await action();
      if (reload) await refreshData();
      return true;
    } catch (err: any) {
      if (err?.status !== 401) alert(err?.message || 'Terjadi kesalahan');
      return false;
    }
  };

  // Global F1 shortcut to enter cashier
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setMode('kasir');
        window.history.replaceState(null, '', '#kasir');
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  const openKasir = () => {
    setMode('kasir');
    window.history.replaceState(null, '', '#kasir');
  };

  const exitKasir = () => {
    setMode('admin');
    window.history.replaceState(null, '', '#');
    refreshData();
  };

  // Badges count
  const lowStockCount = products.filter((p) => p.is_active && p.stock_qty <= p.min_stock).length;
  // Hutang yang jatuh tempo dalam 3 hari atau sudah lewat (BLI-08)
  const dueLimit = new Date();
  dueLimit.setDate(dueLimit.getDate() + 3);
  const dueLimitKey = dueLimit.toLocaleDateString('en-CA');
  const dueDebtCount = purchases.filter(
    (p) => p.payment_status !== 'paid' && p.due_date && p.due_date <= dueLimitKey
  ).length;

  // Handlers → server API
  const handleSaveProduct = (prod: Product) => run(() => api.saveProduct(prod));

  const handleAdjustStock = (
    productId: string,
    newStock: number,
    reason: 'rusak' | 'hilang' | 'pemakaian_sendiri' | 'koreksi',
    note?: string
  ) => run(() => api.manualAdjustStock(productId, newStock, reason, note));

  const handleProcessPurchase = (params: api.PurchaseParams) => run(() => api.processPurchase(params));

  const handleSaveSupplier = (sup: Supplier) => run(() => api.saveSupplier(sup));

  const handlePayDebt = (purchaseId: string, amount: number) =>
    run(() => api.recordSupplierPayment(purchaseId, amount));

  const handleSaveSettings = (newSettings: StoreSettings) =>
    run(async () => setSettingsState(await api.saveSettings(newSettings)), false);

  const handleSaveOpname = (session: OpnameSession) => run(() => api.saveOpnameSession(session));

  const handleFinalizeOpname = (sessionId: string) => run(() => api.finalizeOpnameSession(sessionId));

  const handleVoidSale = (saleId: string, reason: string) => run(() => api.voidSale(saleId, reason));

  const handleSaleReturn = (saleId: string, params: api.SaleReturnParams) =>
    run(() => api.processSaleReturn(saleId, params));

  const handlePurchaseReturn = (purchaseId: string, params: { reason: string; items: Array<{ product_id: string; qty: number }> }) =>
    run(() => api.processPurchaseReturn(purchaseId, params));

  const handleCustomerRequest = (description: string, photoUrl?: string) =>
    run(() => api.addCustomerRequest(description, photoUrl));

  const handleUpdateRequest = (id: string, status: CustomerRequest['status']) =>
    run(() => api.updateCustomerRequestStatus(id, status));

  // Navigations between tabs
  const handleSelectProductForStockCard = (p: Product) => {
    setSelectedProductForStock(p);
    setStockSubTab('card');
    setAdminTab('stock');
  };

  const handleNavigateToPurchase = (p: Product, suggestedQty: number) => {
    setPrefilledPurchaseItem({ product: p, qty: suggestedQty });
    setPurchasesSubTab('receiving');
    setAdminTab('receiving');
  };

  if (authState === 'checking') {
    return <FullScreenMessage text="Memeriksa sesi…" />;
  }
  if (authState === 'guest') {
    return <LoginScreen onSuccess={() => setAuthState('authed')} />;
  }
  if (!isLoaded) {
    return (
      <FullScreenMessage
        text={loadError ? `Gagal memuat data: ${loadError}` : 'Memuat data toko…'}
        mascot={loadError ? 'koneksi' : 'loading'}
        action={loadError ? { label: 'Coba lagi', onClick: refreshData } : undefined}
      />
    );
  }

  // Render Cashier POS mode
  if (mode === 'kasir') {
    return (
      <>
        <OfflineBanner
          offlineSince={offlineSince}
          queue={saleQueue}
          onSyncNow={refreshData}
          onRetryFailed={async () => {
            await offline.retryFailed();
            refreshData();
          }}
          onDiscard={(ref) => offline.discardQueued(ref)}
        />
      <CashierView
        products={products}
        settings={settings}
        onExitKasir={exitKasir}
        onProcessSale={async (params) => {
          const clientRef = offline.newClientRef();
          try {
            if (!navigator.onLine) throw new api.ApiError(0, 'offline');
            const sale = await api.processSale(params, clientRef);
            refreshData();
            return sale;
          } catch (err: any) {
            if (err?.status !== 0) throw err;
            // Offline / koneksi putus: simpan ke antrean (client_ref yang sama → tidak dobel bila ternyata sudah sampai)
            const sale = await offline.enqueueSale(params, clientRef);
            setProducts((prev) =>
              prev.map((p) => {
                const sold = params.items.filter((i) => i.product.id === p.id).reduce((a, i) => a + i.qty, 0);
                return sold ? { ...p, stock_qty: p.stock_qty - sold } : p;
              })
            );
            return sale;
          }
        }}
        onRequestProduct={handleCustomerRequest}
      />
      </>
    );
  }

  // Render Admin Mode (Floating Sidebar + Bento Content)
  return (
    <div className="min-h-screen p-3 flex gap-3">
      <OfflineBanner
        offlineSince={offlineSince}
        queue={saleQueue}
        onSyncNow={refreshData}
        onRetryFailed={async () => {
          await offline.retryFailed();
          refreshData();
        }}
        onDiscard={(ref) => offline.discardQueued(ref)}
      />
      {/* Black Floating Sidebar (Desktop >= 1024px) */}
      <div className="hidden lg:block shrink-0">
        <AdminSidebar
          currentTab={adminTab}
          onSelectTab={(tab) => {
            if (tab === 'restock') {
              setStockSubTab('restock');
              setAdminTab('stock');
            } else if (tab === 'debts') {
              setPurchasesSubTab('debts');
              setAdminTab('debts');
            } else {
              if (tab === 'reports') setReportTab('summary');
              setAdminTab(tab);
            }
          }}
          onOpenKasir={openKasir}
          lowStockCount={lowStockCount}
          dueDebtCount={dueDebtCount}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 pb-28 lg:pb-0">
        {/* Mobile Top Header (hidden on large desktop) */}
        <div className="lg:hidden panel p-3 sm:p-4 mb-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AppIcon size={32} className="rounded-[10px] shadow-xs" />
            <div>
              <h1 className="font-semibold text-sm text-[#111113]">Native Motor</h1>
              <p className="text-[10px] text-[#6E6E76]">Palembang</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="px-2.5 py-1.5 rounded-[9px] bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#111113] text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[#E4E4E7]"
            >
              <Menu size={14} />
              <span>Menu</span>
            </button>

            <button
              onClick={openKasir}
              className="px-3 py-1.5 rounded-[9px] bg-[#111113] hover:bg-[#27272A] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-[#D4FF3F] shrink-0" />
              <span>Kasir</span>
            </button>
          </div>
        </div>

        {/* Tab router */}
        {adminTab === 'dashboard' && (
          <DashboardView
            products={products}
            settings={settings}
            dataVersion={dataVersion}
            onOpenKasir={openKasir}
            onNavigateTab={(tab) => {
              if (tab === 'reports_movement') {
                setReportTab('movement');
                setAdminTab('reports');
              } else if (tab === 'reports') {
                setReportTab('summary');
                setAdminTab('reports');
              } else if (tab === 'restock') {
                setStockSubTab('restock');
                setAdminTab('stock');
              } else if (tab === 'debts') {
                setPurchasesSubTab('debts');
                setAdminTab('debts');
              } else {
                setAdminTab(tab);
              }
            }}
            onOpenQuickReceive={() => {
              setPurchasesSubTab('receiving');
              setAdminTab('receiving');
            }}
          />
        )}

        {adminTab === 'products' && (
          <ProductsView
            products={products}
            onSaveProduct={handleSaveProduct}
            onImported={refreshData}
            onSelectProductForStockCard={handleSelectProductForStockCard}
          />
        )}

        {adminTab === 'stock' && (
          <StockView
            products={products}
            movements={movements}
            suppliers={suppliers}
            productStats={productStats}
            requests={requests}
            onUpdateRequest={handleUpdateRequest}
            activeSubTab={stockSubTab}
            selectedProduct={selectedProductForStock}
            onAdjustStock={handleAdjustStock}
            onNavigateToPurchase={handleNavigateToPurchase}
          />
        )}

        {adminTab === 'sales' && (
          <SalesHistoryView
            sales={sales}
            saleReturns={saleReturns}
            settings={settings}
            onVoidSale={handleVoidSale}
            onReturnSale={handleSaleReturn}
          />
        )}

        {(adminTab === 'receiving' || adminTab === 'suppliers' || adminTab === 'debts' || adminTab === 'purchase_history') && (
          <PurchasesView
            products={products}
            suppliers={suppliers}
            purchases={purchases}
            purchaseReturns={purchaseReturns}
            onReturnPurchase={handlePurchaseReturn}
            initialTab={
              adminTab === 'suppliers'
                ? 'suppliers'
                : adminTab === 'debts'
                ? 'debts'
                : adminTab === 'purchase_history'
                ? 'history'
                : 'receiving'
            }
            prefilledProduct={prefilledPurchaseItem?.product}
            prefilledQty={prefilledPurchaseItem?.qty}
            onProcessPurchase={handleProcessPurchase}
            onSaveSupplier={handleSaveSupplier}
            onPayDebt={handlePayDebt}
          />
        )}

        {adminTab === 'labels' && <LabelPrintView products={products} onSaveProduct={handleSaveProduct} />}

        {adminTab === 'opname' && (
          <OpnameView
            products={products}
            sessions={opnames}
            onFinalizeSession={handleFinalizeOpname}
            onSaveSession={handleSaveOpname}
          />
        )}

        {(adminTab === 'reports' || adminTab === 'expenses') && (
          <ReportsView
            settings={settings}
            initialTab={adminTab === 'expenses' ? 'expenses' : reportTab}
            onChanged={refreshData}
          />
        )}

        {(adminTab === 'settings' || adminTab === 'backup') && (
          <SettingsView
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onReloadAllData={refreshData}
          />
        )}
      </main>

      {/* Floating Bottom Nav for Mobile Screens */}
      <nav className="lg:hidden fixed bottom-3 left-3 right-3 bg-[#0E0E10] text-[#F4F4F5] rounded-[18px] p-1.5 sm:p-2 flex items-center justify-around shadow-2xl z-40 border border-[#2A2A2E]">
        <button
          onClick={() => setAdminTab('dashboard')}
          className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${
            adminTab === 'dashboard' ? 'text-[#D4FF3F]' : 'text-[#71717A]'
          }`}
        >
          <LayoutDashboard size={18} />
          <span className="text-[10px] font-medium">Beranda</span>
        </button>

        <button
          onClick={() => setAdminTab('products')}
          className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${
            adminTab === 'products' ? 'text-[#D4FF3F]' : 'text-[#71717A]'
          }`}
        >
          <Package size={18} />
          <span className="text-[10px] font-medium">Produk</span>
        </button>

        <button
          onClick={openKasir}
          className="p-2 sm:p-2.5 rounded-xl bg-[#D4FF3F] text-[#111113] font-bold flex flex-col items-center shadow-md -translate-y-2 active:scale-95 transition-transform"
        >
          <ShoppingBag size={20} />
          <span className="text-[10px]">Kasir</span>
        </button>

        <button
          onClick={() => {
            setPurchasesSubTab('receiving');
            setAdminTab('receiving');
          }}
          className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${
            adminTab === 'receiving' ? 'text-[#D4FF3F]' : 'text-[#71717A]'
          }`}
        >
          <Truck size={18} />
          <span className="text-[10px] font-medium">Terima</span>
        </button>

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${
            isMobileMenuOpen ? 'text-[#D4FF3F]' : 'text-[#71717A]'
          }`}
        >
          <MoreHorizontal size={18} />
          <span className="text-[10px] font-medium">Lainnya</span>
        </button>
      </nav>

      {/* Off-canvas Full Mobile Drawer for Admin Navigation */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="w-11/12 max-w-xs bg-[#0E0E10] text-[#F4F4F5] h-full p-4 flex flex-col justify-between shadow-2xl border-l border-[#2A2A2E] animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2E]">
                <div className="flex items-center gap-2.5">
                  <AppIcon size={32} className="rounded-[10px]" />
                  <div>
                    <h3 className="font-semibold text-sm text-white">Native Motor</h3>
                    <p className="text-[10px] text-[#A1A1AA]">Navigasi Lengkap</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-full text-[#A1A1AA] hover:text-white hover:bg-[#1C1C1F]"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Menu Groups */}
              <div className="flex flex-col gap-3 text-xs">
                {/* UTAMA */}
                <div>
                  <span className="text-[10px] font-semibold text-[#71717A] tracking-wider uppercase">
                    Utama
                  </span>
                  <div className="flex flex-col gap-1 mt-1.5">
                    <button
                      onClick={() => {
                        setAdminTab('dashboard');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium transition-colors ${
                        adminTab === 'dashboard'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <LayoutDashboard size={16} />
                      <span>Beranda / Dashboard</span>
                    </button>

                    <button
                      onClick={() => {
                        openKasir();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full p-2.5 rounded-[10px] text-left flex items-center justify-between font-semibold bg-[#D4FF3F] text-[#111113]"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShoppingBag size={16} />
                        <span>Mode Kasir (POS)</span>
                      </div>
                      <span className="font-mono text-[10px] bg-[#111113] text-[#D4FF3F] px-1.5 py-0.5 rounded">
                        F1
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setAdminTab('sales');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'sales' ? 'bg-[#1C1C1F] text-white font-semibold' : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <History size={16} />
                      <span>Riwayat Penjualan & Retur</span>
                    </button>
                  </div>
                </div>

                {/* GUDANG */}
                <div>
                  <span className="text-[10px] font-semibold text-[#71717A] tracking-wider uppercase">
                    Gudang & Stok
                  </span>
                  <div className="flex flex-col gap-1 mt-1.5">
                    <button
                      onClick={() => {
                        setAdminTab('products');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'products'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Package size={16} />
                      <span>Katalog Produk</span>
                    </button>

                    <button
                      onClick={() => {
                        setStockSubTab('card');
                        setAdminTab('stock');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'stock' && stockSubTab === 'card'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Layers size={16} />
                      <span>Stok & Kartu Stok</span>
                    </button>

                    <button
                      onClick={() => {
                        setStockSubTab('restock');
                        setAdminTab('stock');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center justify-between font-medium ${
                        adminTab === 'stock' && stockSubTab === 'restock'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <TrendingUp size={16} />
                        <span>Perlu Dibeli (Restock)</span>
                      </div>
                      {lowStockCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-[#D4FF3F] text-[#111113] font-bold text-[10px]">
                          {lowStockCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setAdminTab('opname');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'opname'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <ClipboardList size={16} />
                      <span>Stock Opname</span>
                    </button>

                    <button
                      onClick={() => {
                        setAdminTab('labels');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'labels' ? 'bg-[#1C1C1F] text-white font-semibold' : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Barcode size={16} />
                      <span>Cetak Label Barcode</span>
                    </button>
                  </div>
                </div>

                {/* PEMBELIAN */}
                <div>
                  <span className="text-[10px] font-semibold text-[#71717A] tracking-wider uppercase">
                    Pembelian & Hutang
                  </span>
                  <div className="flex flex-col gap-1 mt-1.5">
                    <button
                      onClick={() => {
                        setPurchasesSubTab('receiving');
                        setAdminTab('receiving');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'receiving'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Truck size={16} />
                      <span>Terima Barang</span>
                    </button>

                    <button
                      onClick={() => {
                        setPurchasesSubTab('suppliers');
                        setAdminTab('suppliers');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'suppliers'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Building2 size={16} />
                      <span>Master Supplier</span>
                    </button>

                    <button
                      onClick={() => {
                        setAdminTab('purchase_history');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'purchase_history' ? 'bg-[#1C1C1F] text-white font-semibold' : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <History size={16} />
                      <span>Riwayat Pembelian & Retur</span>
                    </button>

                    <button
                      onClick={() => {
                        setPurchasesSubTab('debts');
                        setAdminTab('debts');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center justify-between font-medium ${
                        adminTab === 'debts'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <CreditCard size={16} />
                        <span>Hutang Supplier</span>
                      </div>
                      {dueDebtCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-[#FEF3C7] text-[#92400E] font-bold text-[10px]">
                          {dueDebtCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* LAPORAN & SISTEM */}
                <div>
                  <span className="text-[10px] font-semibold text-[#71717A] tracking-wider uppercase">
                    Laporan & Pengaturan
                  </span>
                  <div className="flex flex-col gap-1 mt-1.5">
                    <button
                      onClick={() => {
                        setAdminTab('reports');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'reports'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <BarChart3 size={16} />
                      <span>Laporan Penjualan & Laba</span>
                    </button>

                    <button
                      onClick={() => {
                        setAdminTab('expenses');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'expenses'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Receipt size={16} />
                      <span>Biaya Operasional</span>
                    </button>

                    <button
                      onClick={() => {
                        setAdminTab('settings');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'settings'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Settings size={16} />
                      <span>Profil Toko & Struk</span>
                    </button>

                    <button
                      onClick={() => {
                        setAdminTab('backup');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-[10px] text-left flex items-center gap-2.5 font-medium ${
                        adminTab === 'backup'
                          ? 'bg-[#1C1C1F] text-white font-semibold'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      <Database size={16} />
                      <span>Backup & Pulihkan Data</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#2A2A2E] text-[11px] text-[#71717A] flex justify-between items-center">
              <span>Native Motor v1.2</span>
              <span className="font-mono text-[#D4FF3F]">Mode Sentuh</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
