import React from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Layers,
  TrendingUp,
  ClipboardList,
  Truck,
  Building2,
  CreditCard,
  BarChart3,
  Receipt,
  Settings,
  Database,
  ExternalLink,
  History,
  Barcode,
} from 'lucide-react';
import { AppIcon } from '../common/Brand';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  action?: () => void;
  highlight?: boolean;
  kbd?: string;
  badge?: string;
  badgeLime?: boolean;
  badgeWarn?: boolean;
}

interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenKasir: () => void;
  lowStockCount: number;
  dueDebtCount: number;
}

export function AdminSidebar({
  currentTab,
  onSelectTab,
  onOpenKasir,
  lowStockCount,
  dueDebtCount,
}: SidebarProps) {
  const menuSections: SidebarSection[] = [
    {
      items: [
        { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard },
        {
          id: 'kasir_trigger',
          label: 'Kasir (POS)',
          icon: ShoppingBag,
          action: onOpenKasir,
          highlight: true,
          kbd: 'F1',
        },
        { id: 'sales', label: 'Riwayat Penjualan', icon: History },
      ],
    },
    {
      title: 'GUDANG',
      items: [
        { id: 'products', label: 'Produk', icon: Package },
        { id: 'stock', label: 'Stok & Kartu', icon: Layers },
        {
          id: 'restock',
          label: 'Perlu Dibeli',
          icon: TrendingUp,
          badge: lowStockCount > 0 ? String(lowStockCount) : undefined,
          badgeLime: true,
        },
        { id: 'opname', label: 'Stock Opname', icon: ClipboardList },
        { id: 'labels', label: 'Label Barcode', icon: Barcode },
      ],
    },
    {
      title: 'PEMBELIAN',
      items: [
        { id: 'receiving', label: 'Terima Barang', icon: Truck },
        { id: 'suppliers', label: 'Supplier', icon: Building2 },
        { id: 'purchase_history', label: 'Riwayat & Retur', icon: History },
        {
          id: 'debts',
          label: 'Hutang',
          icon: CreditCard,
          badge: dueDebtCount > 0 ? `${dueDebtCount} jatuh tempo` : undefined,
          badgeWarn: true,
        },
      ],
    },
    {
      title: 'ANALISIS',
      items: [
        { id: 'reports', label: 'Laporan', icon: BarChart3 },
        { id: 'expenses', label: 'Biaya Operasional', icon: Receipt },
      ],
    },
    {
      title: 'SISTEM',
      items: [
        { id: 'settings', label: 'Pengaturan Toko', icon: Settings },
        { id: 'backup', label: 'Backup & Data', icon: Database },
      ],
    },
  ];

  return (
    <aside className="w-[244px] shrink-0 bg-[#0E0E10] text-[#F4F4F5] rounded-[22px] p-3 flex flex-col justify-between shadow-[0_24px_48px_-24px_rgba(17,17,19,0.45)] h-[calc(100vh-24px)] sticky top-3 select-none">
      <div className="flex flex-col gap-5 overflow-y-auto pr-1">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 pt-2">
          <AppIcon size={38} className="rounded-[12px] shadow-sm" />
          <div className="leading-tight overflow-hidden">
            <h1 className="font-semibold text-sm text-[#F4F4F5] tracking-tight truncate">
              Native Motor
            </h1>
            <p className="text-[11px] text-[#A1A1AA] truncate">Sparepart Motor · POS</p>
          </div>
        </div>

        {/* Menu Navigation */}
        <nav className="flex flex-col gap-4 text-xs font-medium">
          {menuSections.map((section, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              {section.title && (
                <div className="text-[10px] uppercase tracking-wider text-[#71717A] px-3 pt-1 pb-0.5 font-semibold">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.action) {
                        item.action();
                      } else {
                        onSelectTab(item.id);
                      }
                    }}
                    className={`group flex items-center justify-between px-3 py-2 rounded-[12px] text-left transition-all duration-150 ${
                      isActive
                        ? 'bg-[#1F1F23] text-white font-semibold'
                        : item.highlight
                        ? 'bg-[#1C1C1F] text-[#F4F4F5] hover:bg-[#27272A]'
                        : 'text-[#A1A1AA] hover:text-white hover:bg-[#1A1A1D]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        size={17}
                        strokeWidth={1.8}
                        className={`shrink-0 transition-colors ${
                          isActive
                            ? 'text-[#D4FF3F]'
                            : item.highlight
                            ? 'text-[#D4FF3F]'
                            : 'text-[#71717A] group-hover:text-white'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      {item.badge && item.badgeLime && (
                        <span className="bg-[#D4FF3F] text-[#111113] text-[10px] font-bold px-1.5 py-0.5 rounded-[6px] num">
                          {item.badge}
                        </span>
                      )}
                      {item.badge && item.badgeWarn && (
                        <span className="text-[#FBBF24] text-[10px] font-medium">
                          {item.badge}
                        </span>
                      )}
                      {item.kbd && (
                        <kbd className="text-[10px] font-mono bg-[#2A2A2E] text-[#A1A1AA] px-1.5 py-0.5 rounded">
                          {item.kbd}
                        </kbd>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* User Profile Card */}
      <div className="pt-3 border-t border-[#2A2A2E] mt-2 px-1">
        <div className="flex items-center justify-between p-2 rounded-[14px] bg-[#1C1C1F]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#27272A] border border-[#3F3F46] flex items-center justify-center text-xs font-semibold text-[#D4FF3F]">
              P
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-xs font-medium text-white truncate">Pemilik Toko</p>
              <p className="text-[11px] text-[#A1A1AA] truncate">Palembang (WIB)</p>
            </div>
          </div>
          <button
            onClick={() => onSelectTab('settings')}
            title="Pengaturan"
            className="p-1.5 text-[#71717A] hover:text-white transition-colors"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
