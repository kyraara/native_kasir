import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit2,
  Trash2,
  X,
  Package,
  Layers,
  Check,
  ChevronRight,
  Bike,
  Sparkles,
} from 'lucide-react';
import { Product, PartType, MotorFitment } from '../../types';
import { StatusDot, PartTypeBadge } from '../common/Badge';
import { formatRupiah } from '../../utils/pricing';
import { searchProducts, listMotors, MotorFilter } from '../../utils/search';
import { MotorChips } from '../common/MotorChips';
import { ProductImportModal } from './ProductImportModal';
import { ProductPhotoManager } from './ProductPhotoManager';
import { exportProductsCsv } from '../../utils/productCsv';
import { generateInternalBarcode } from '../../utils/barcode';

interface ProductsViewProps {
  products: Product[];
  onSaveProduct: (product: Product) => Promise<boolean>;
  onImported: () => void;
  onSelectProductForStockCard: (product: Product) => void;
}

const DEFAULT_CATEGORIES = [
  'Sistem Pengereman',
  'Transmisi & CVT',
  'Kelistrikan & Pengapian',
  'Oli & Pelumas',
  'Suspensi & Roda',
  'Mesin & Ruang Bakar',
];

export function ProductsView({
  products,
  onSaveProduct,
  onImported,
  onSelectProductForStockCard,
}: ProductsViewProps) {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [selectedMotor, setSelectedMotor] = useState<MotorFilter | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'low' | 'out' | 'archived' | 'nophoto'>('all');

  const motors = useMemo(() => listMotors(products), [products]);
  const CATEGORIES = useMemo(
    () => ['Semua', ...new Set([...DEFAULT_CATEGORIES, ...products.map((p) => p.category).filter(Boolean)])],
    [products]
  );

  // Drawer / Modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null);
  // Stok & HPP hanya bisa diisi sebagai saldo awal produk baru (STK-01)
  const isNewProduct = !!editingProduct && !products.some((p) => p.id === editingProduct.id);

  // Filtered products
  const filteredProducts = useMemo(() => {
    const base = products.filter((p) => {
      const matchCategory = selectedCategory === 'Semua' || p.category === selectedCategory;

      // Produk arsip hanya muncul di filter "Arsip"
      let matchStatus = statusFilter === 'archived' ? !p.is_active : p.is_active;
      if (statusFilter === 'out') matchStatus &&= p.stock_qty <= 0;
      else if (statusFilter === 'low') matchStatus &&= p.stock_qty > 0 && p.stock_qty <= p.min_stock;
      else if (statusFilter === 'safe') matchStatus &&= p.stock_qty > p.min_stock;
      else if (statusFilter === 'nophoto') matchStatus &&= p.photos.length === 0;

      return matchCategory && matchStatus;
    });
    return searchProducts(base, searchQuery, { motor: selectedMotor });
  }, [products, searchQuery, selectedCategory, selectedMotor, statusFilter]);

  const handleCreateNew = () => {
    const newProd: Product = {
      id: `prod-${Date.now()}`,
      sku: `NM-${Math.floor(100 + Math.random() * 900)}`,
      part_number: '',
      barcode: '',
      name: '',
      brand: 'Honda Genuine Parts (AHM)',
      category: 'Sistem Pengereman',
      part_type: 'oem',
      unit: 'pcs',
      sell_price: 50000,
      sell_price_2: 45000,
      avg_cost: 35000,
      stock_qty: 10,
      min_stock: 5,
      rack_location: 'A-01',
      is_active: true,
      photos: [],
      fitments: [{ brand: 'Honda', model: 'Beat FI', year_from: 2016, year_to: 2024 }],
      created_at: new Date().toISOString(),
    };
    setEditingProduct(newProd);
    setIsModalOpen(true);
  };

  const handleExportCSV = () => exportProductsCsv(products);

  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Top Action Bar */}
      <div className="panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#111113]">
            Katalog Produk & Kompatibilitas
          </h2>
          <p className="text-xs text-[#5B5B63] mt-0.5">
            Total {products.length} SKU terdaftar · Dilengkapi data kompatibilitas motor & lokasi rak
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2.5 rounded-[12px] bg-[#FFFFFF] border border-[#E4E4E7] text-[#111113] hover:bg-[#F4F4F5] text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setIsImportOpen(true)}
            className="px-3.5 py-2.5 rounded-[12px] bg-[#FFFFFF] border border-[#E4E4E7] text-[#111113] hover:bg-[#F4F4F5] text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
          >
            <Upload size={14} />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleCreateNew}
            className="px-4 py-2.5 rounded-[12px] bg-[#111113] text-white hover:bg-[#27272A] text-xs font-semibold flex items-center gap-2 transition-all shadow-md"
          >
            <Plus size={15} />
            <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="panel p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search
              size={17}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#71717A]"
            />
            <input
              type="text"
              placeholder="Cari nama, part number, motor + tahun (mis. kampas beat 2018)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-[12px] bg-[#F4F4F5] text-xs font-medium text-[#111113] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#111113] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#111113]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Motor Filter Chips */}
          <div className="md:col-span-4 flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <MotorChips motors={motors} value={selectedMotor} onChange={setSelectedMotor} maxChips={4} />
          </div>

          {/* Status Filter */}
          <div className="md:col-span-3 flex justify-end items-center gap-1.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1.5 rounded-[8px] text-xs font-medium ${
                statusFilter === 'all' ? 'bg-[#111113] text-white' : 'text-[#6E6E76] hover:bg-[#F4F4F5]'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('low')}
              className={`px-2.5 py-1.5 rounded-[8px] text-xs font-medium flex items-center gap-1.5 ${
                statusFilter === 'low'
                  ? 'bg-[#FEF3C7] text-[#92400E] font-semibold'
                  : 'text-[#D97706] hover:bg-[#FEF3C7]/40'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#D97706]" />
              Menipis
            </button>
            <button
              onClick={() => setStatusFilter('out')}
              className={`px-2.5 py-1.5 rounded-[8px] text-xs font-medium flex items-center gap-1.5 ${
                statusFilter === 'out'
                  ? 'bg-[#FEE2E2] text-[#B91C1C] font-semibold'
                  : 'text-[#DC2626] hover:bg-[#FEE2E2]/40'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
              Habis
            </button>
            <button
              onClick={() => setStatusFilter('nophoto')}
              title="Mode Lengkapi Foto: produk yang belum punya foto"
              className={`px-2.5 py-1.5 rounded-[8px] text-xs font-medium ${
                statusFilter === 'nophoto' ? 'bg-[#111113] text-[#D4FF3F] font-semibold' : 'text-[#6E6E76] hover:bg-[#F4F4F5]'
              }`}
            >
              Tanpa foto ({products.filter((p) => p.is_active && p.photos.length === 0).length})
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`px-2.5 py-1.5 rounded-[8px] text-xs font-medium ${
                statusFilter === 'archived' ? 'bg-[#E4E4E7] text-[#111113] font-semibold' : 'text-[#6E6E76] hover:bg-[#F4F4F5]'
              }`}
            >
              Arsip
            </button>
          </div>
        </div>

        {/* Categories Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-[#F4F4F5]">
          <span className="text-xs text-[#71717A] shrink-0 font-medium">Kategori:</span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-[8px] text-xs shrink-0 transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#111113] text-[#D4FF3F] font-semibold'
                  : 'bg-[#F4F4F5] text-[#5B5B63] hover:text-[#111113]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product List Table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold uppercase tracking-wider text-[11px] border-b border-[#E4E4E7]">
              <tr>
                <th className="py-3.5 px-4">Produk</th>
                <th className="py-3.5 px-3">Kode / Rak</th>
                <th className="py-3.5 px-3">Kompatibilitas</th>
                <th className="py-3.5 px-3 text-right">HPP (Avg)</th>
                <th className="py-3.5 px-3 text-right">Harga Jual</th>
                <th className="py-3.5 px-3 text-center">Stok</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F4F5]">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#71717A]">
                    Tidak ada produk yang cocok dengan pencarian atau filter ini.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const status =
                    p.stock_qty <= 0
                      ? 'out'
                      : p.stock_qty <= p.min_stock
                      ? 'low'
                      : 'safe';

                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedDetailProduct(p)}
                      className="hover:bg-[#F9FAFB] cursor-pointer transition-colors group"
                    >
                      {/* Product Name & Photo */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-[10px] overflow-hidden bg-[#F4F4F5] border border-[#E4E4E7] shrink-0 flex items-center justify-center">
                            {p.photos && p.photos[0] ? (
                              <img
                                src={p.photos[0]}
                                alt={p.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package size={18} className="text-[#A1A1AA]" />
                            )}
                          </div>
                          <div className="min-w-0 max-w-xs md:max-w-md">
                            {(!p.photos || p.photos.length === 0) && (
                              <span className="inline-block mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#D97706] bg-[#FEF3C7] px-1.5 rounded">
                                Belum ada foto
                              </span>
                            )}
                            <div className="flex items-center gap-1.5">
                              <PartTypeBadge type={p.part_type} />
                              <span className="font-semibold text-[#111113] truncate group-hover:text-[#000000]">
                                {p.name}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#6E6E76] truncate mt-0.5">
                              {p.brand} · {p.category}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Part Number & Rack */}
                      <td className="py-3 px-3">
                        <p className="font-mono text-xs text-[#111113] font-medium">
                          {p.part_number || '-'}
                        </p>
                        <p className="text-[11px] text-[#71717A] mt-0.5">
                          Rak: <span className="font-mono font-medium text-[#111113]">{p.rack_location}</span>
                        </p>
                      </td>

                      {/* Motor Fitment Tags */}
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {p.fitments.slice(0, 2).map((f, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded-[6px] bg-[#F4F4F5] text-[10px] text-[#5B5B63] font-medium truncate"
                            >
                              {f.model}
                            </span>
                          ))}
                          {p.fitments.length > 2 && (
                            <span className="px-1.5 py-0.5 rounded-[6px] bg-[#F4F4F5] text-[10px] text-[#71717A] font-medium">
                              +{p.fitments.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* HPP (Avg Cost) */}
                      <td className="py-3 px-3 text-right font-mono text-xs text-[#5B5B63] num">
                        {formatRupiah(p.avg_cost)}
                      </td>

                      {/* Selling Price */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-mono font-semibold text-xs text-[#111113] num">
                          {formatRupiah(p.sell_price)}
                        </div>
                        {p.sell_price_2 && (
                          <div className="text-[10px] text-[#71717A] font-mono num">
                            Bengkel: {formatRupiah(p.sell_price_2)}
                          </div>
                        )}
                      </td>

                      {/* Stock Status */}
                      <td className="py-3 px-3 text-center">
                        <StatusDot
                          status={status}
                          text={
                            status === 'out'
                              ? 'Habis (0)'
                              : status === 'low'
                              ? `Sisa ${p.stock_qty}`
                              : `Stok ${p.stock_qty}`
                          }
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onSelectProductForStockCard(p)}
                            title="Kartu Stok"
                            className="p-1.5 rounded-[8px] hover:bg-[#E4E4E7] text-[#5B5B63] hover:text-[#111113] transition-colors"
                          >
                            <Layers size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setIsModalOpen(true);
                            }}
                            title="Edit Produk"
                            className="p-1.5 rounded-[8px] hover:bg-[#E4E4E7] text-[#5B5B63] hover:text-[#111113] transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over / Modal: Edit or Create Product */}
      {isModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-[#E4E4E7] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#111113]">
                  {editingProduct.id.startsWith('prod-') && editingProduct.name
                    ? 'Ubah Produk'
                    : 'Tambah Produk Baru'}
                </h3>
                <p className="text-xs text-[#6E6E76]">Lengkapi data spesifikasi & kecocokan motor</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-[#F4F4F5] text-[#71717A]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-6 overflow-y-auto flex flex-col gap-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="font-medium text-[#111113] mb-1 block">Nama Produk</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, name: e.target.value })
                    }
                    placeholder="misal: Kampas Rem Depan Beat FI"
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-medium text-[#111113] outline-none focus:ring-2 focus:ring-[#111113]"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#111113] mb-1 block">SKU Internal</label>
                  <input
                    type="text"
                    value={editingProduct.sku}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, sku: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-mono text-[#111113] outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#111113] mb-1 block">Nomor Part OEM</label>
                  <input
                    type="text"
                    value={editingProduct.part_number}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, part_number: e.target.value })
                    }
                    placeholder="misal: 06455-K44-V01"
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-mono text-[#111113] outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#111113] mb-1 block">Barcode</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={editingProduct.barcode}
                      onChange={(e) => setEditingProduct({ ...editingProduct, barcode: e.target.value.trim() })}
                      placeholder="Scan barcode pabrik di sini"
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-mono text-[#111113] outline-none"
                    />
                    <button
                      type="button"
                      title="Buat barcode internal toko (awalan 20, tidak bentrok dengan barcode pabrik)"
                      onClick={() =>
                        setEditingProduct({
                          ...editingProduct,
                          barcode: generateInternalBarcode(new Set(products.map((p) => p.barcode).filter(Boolean))),
                        })
                      }
                      className="px-3 rounded-[12px] bg-[#111113] text-white text-[11px] font-semibold shrink-0"
                    >
                      Buat
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-medium text-[#111113] mb-1 block">Merek</label>
                  <input
                    type="text"
                    value={editingProduct.brand}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, brand: e.target.value })
                    }
                    placeholder="misal: AHM, NGK, GS Astra"
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-medium text-[#111113] outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#111113] mb-1 block">Jenis Part</label>
                  <select
                    value={editingProduct.part_type}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        part_type: e.target.value as PartType,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-medium text-[#111113] outline-none"
                  >
                    <option value="oem">Original (OEM)</option>
                    <option value="aftermarket">KW / Aftermarket</option>
                    <option value="used">Copotan / Bekas</option>
                  </select>
                </div>

                <div>
                  <label className="font-medium text-[#111113] mb-1 block">Kategori</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, category: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-medium text-[#111113] outline-none"
                  >
                    {CATEGORIES.filter((c) => c !== 'Semua').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-medium text-[#111113] mb-1 block">Lokasi Rak</label>
                  <input
                    type="text"
                    value={editingProduct.rack_location}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, rack_location: e.target.value })
                    }
                    placeholder="misal: A-01, B-03"
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] font-mono text-[#111113] outline-none"
                  />
                </div>
              </div>

              {/* Pricing & Stock */}
              <div className="p-4 rounded-[14px] bg-[#F4F4F5] grid grid-cols-3 gap-3">
                <div>
                  <label className="font-medium text-[#5B5B63] mb-1 block">Harga Ecer (Rp)</label>
                  <input
                    type="number"
                    value={editingProduct.sell_price}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        sell_price: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-[10px] bg-white font-mono font-semibold text-[#111113] outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#5B5B63] mb-1 block">Harga Bengkel (Rp)</label>
                  <input
                    type="number"
                    value={editingProduct.sell_price_2 || ''}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        sell_price_2: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    placeholder="Opsional"
                    className="w-full px-3 py-2 rounded-[10px] bg-white font-mono text-[#111113] outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#5B5B63] mb-1 block">
                    {isNewProduct ? 'HPP Awal (Rp)' : 'HPP Rata-rata (otomatis)'}
                  </label>
                  <input
                    type="number"
                    disabled={!isNewProduct}
                    value={editingProduct.avg_cost}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        avg_cost: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-[10px] bg-white font-mono text-[#5B5B63] outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#5B5B63] mb-1 block">
                    {isNewProduct ? 'Stok Awal' : 'Stok (ubah lewat Penyesuaian/Opname)'}
                  </label>
                  <input
                    type="number"
                    disabled={!isNewProduct}
                    value={editingProduct.stock_qty}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        stock_qty: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-[10px] bg-white font-mono text-[#111113] outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#5B5B63] mb-1 block">Batas Stok Minimum</label>
                  <input
                    type="number"
                    value={editingProduct.min_stock}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        min_stock: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-[10px] bg-white font-mono text-[#111113] outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-[#5B5B63] mb-1 block">Satuan</label>
                  <select
                    value={editingProduct.unit}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, unit: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-[10px] bg-white font-medium text-[#111113] outline-none"
                  >
                    <option value="pcs">pcs</option>
                    <option value="set">set</option>
                    <option value="pasang">pasang</option>
                    <option value="botol">botol</option>
                    <option value="liter">liter</option>
                  </select>
                </div>
              </div>

              {/* Foto Produk */}
              <ProductPhotoManager
                photos={editingProduct.photos}
                onChange={(photos) => setEditingProduct({ ...editingProduct, photos })}
              />

              {/* Kompatibilitas Motor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-[#111113] flex items-center gap-1.5">
                    <Bike size={14} />
                    <span>Kompatibilitas Motor</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProduct({
                        ...editingProduct,
                        fitments: [
                          ...editingProduct.fitments,
                          { brand: 'Honda', model: 'Beat', year_from: 2018, year_to: 2024 },
                        ],
                      });
                    }}
                    className="text-[11px] font-semibold text-[#111113] hover:underline"
                  >
                    + Tambah Motor
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {editingProduct.fitments.map((fit, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-[10px] bg-[#F4F4F5]"
                    >
                      <input
                        type="text"
                        placeholder="Merek (Honda/Yamaha)"
                        value={fit.brand}
                        onChange={(e) => {
                          const updated = [...editingProduct.fitments];
                          updated[idx].brand = e.target.value;
                          setEditingProduct({ ...editingProduct, fitments: updated });
                        }}
                        className="w-28 px-2 py-1 rounded bg-white font-medium outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Model (Beat FI / Vario)"
                        value={fit.model}
                        onChange={(e) => {
                          const updated = [...editingProduct.fitments];
                          updated[idx].model = e.target.value;
                          setEditingProduct({ ...editingProduct, fitments: updated });
                        }}
                        className="flex-1 px-2 py-1 rounded bg-white font-medium outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = editingProduct.fitments.filter((_, i) => i !== idx);
                          setEditingProduct({ ...editingProduct, fitments: updated });
                        }}
                        className="text-[#DC2626] p-1 hover:bg-[#FEE2E2] rounded"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#E4E4E7] flex justify-end gap-2 bg-[#F9FAFB]">
              {!isNewProduct && (
                <button
                  type="button"
                  onClick={async () => {
                    const archiving = editingProduct.is_active;
                    if (archiving && !window.confirm('Arsipkan produk ini? Produk tidak akan muncul di kasir, tapi riwayatnya tetap tersimpan.')) return;
                    if (await onSaveProduct({ ...editingProduct, is_active: !archiving })) setIsModalOpen(false);
                  }}
                  className="mr-auto px-4 py-2 rounded-[12px] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]"
                >
                  {editingProduct.is_active ? 'Arsipkan' : 'Aktifkan Lagi'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-[12px] text-xs font-semibold text-[#5B5B63] hover:bg-[#F4F4F5]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!editingProduct.name.trim()) {
                    alert('Nama produk wajib diisi');
                    return;
                  }
                  if (await onSaveProduct(editingProduct)) setIsModalOpen(false);
                }}
                className="px-5 py-2 rounded-[12px] bg-[#111113] text-white text-xs font-semibold hover:bg-[#27272A]"
              >
                Simpan Produk
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportOpen && (
        <ProductImportModal
          products={products}
          onClose={() => setIsImportOpen(false)}
          onImported={() => {
            setIsImportOpen(false);
            onImported();
          }}
        />
      )}

      {/* Product Detail Slide-over */}
      {selectedDetailProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-2xs flex justify-end"
          onClick={() => setSelectedDetailProduct(null)}
        >
          <div
            className="w-full max-w-md bg-white h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#E4E4E7]">
                <span className="text-xs font-mono text-[#71717A]">{selectedDetailProduct.sku}</span>
                <button
                  onClick={() => setSelectedDetailProduct(null)}
                  className="p-1 rounded-full hover:bg-[#F4F4F5] text-[#71717A]"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Product Photo */}
              <div className="w-full aspect-square max-h-56 rounded-[18px] bg-[#F4F4F5] border border-[#E4E4E7] overflow-hidden my-4 flex items-center justify-center">
                {selectedDetailProduct.photos && selectedDetailProduct.photos[0] ? (
                  <img
                    src={selectedDetailProduct.photos[0]}
                    alt={selectedDetailProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package size={36} className="text-[#A1A1AA]" />
                )}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <PartTypeBadge type={selectedDetailProduct.part_type} />
                <span className="text-xs text-[#6E6E76]">{selectedDetailProduct.brand}</span>
              </div>
              <h3 className="text-xl font-semibold text-[#111113] leading-snug">
                {selectedDetailProduct.name}
              </h3>
              <p className="text-xs text-[#71717A] mt-1 font-mono">
                Part No: {selectedDetailProduct.part_number || '-'} · Rak: {selectedDetailProduct.rack_location}
              </p>

              {/* Price & Stock card */}
              <div className="mt-5 p-4 rounded-[16px] bg-[#F4F4F5] flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-[#5B5B63]">Harga Jual Ecer</span>
                  <div className="text-2xl font-bold font-mono text-[#111113] num">
                    {formatRupiah(selectedDetailProduct.sell_price)}
                  </div>
                  <span className="text-[11px] text-[#6E6E76] font-mono">
                    HPP: {formatRupiah(selectedDetailProduct.avg_cost)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-[#5B5B63]">Sisa Stok</span>
                  <div className="text-2xl font-bold font-mono text-[#111113] num">
                    {selectedDetailProduct.stock_qty} {selectedDetailProduct.unit}
                  </div>
                  <span className="text-[10px] text-[#71717A]">Min: {selectedDetailProduct.min_stock}</span>
                </div>
              </div>

              {/* Compatibility section */}
              <div className="mt-5">
                <h4 className="text-xs font-semibold text-[#111113] uppercase tracking-wider mb-2">
                  Cocok Untuk Motor:
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDetailProduct.fitments.map((fit, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-[8px] bg-[#F4F4F5] text-xs font-medium text-[#111113]"
                    >
                      {fit.brand} {fit.model} ({fit.year_from}–{fit.year_to})
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-[#E4E4E7] flex gap-2">
              <button
                onClick={() => {
                  setEditingProduct(selectedDetailProduct);
                  setIsModalOpen(true);
                  setSelectedDetailProduct(null);
                }}
                className="flex-1 py-2.5 rounded-[12px] bg-[#F4F4F5] hover:bg-[#E4E4E7] text-xs font-semibold text-[#111113] transition-colors"
              >
                Ubah Produk
              </button>
              <button
                onClick={() => {
                  onSelectProductForStockCard(selectedDetailProduct);
                  setSelectedDetailProduct(null);
                }}
                className="flex-1 py-2.5 rounded-[12px] bg-[#111113] hover:bg-[#27272A] text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <Layers size={14} />
                <span>Kartu Stok</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
