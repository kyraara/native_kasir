import React, { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Product } from '../../types';
import { searchProducts, findByExactCode } from '../../utils/search';

interface Props {
  products: Product[];
  onPick: (p: Product) => void;
  placeholder?: string;
  /** Produk yang sudah dipilih (ditandai di hasil) */
  pickedIds?: string[];
}

/** Kolom cari produk dengan saran hasil; Enter = pilih hasil teratas / kode barcode persis. */
export function ProductPicker({ products, onPick, placeholder = 'Cari / scan produk…', pickedIds = [] }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (query.trim() ? searchProducts(products, query).slice(0, 8) : []), [products, query]);

  const pick = (p: Product) => {
    onPick(p);
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = findByExactCode(products, query) || results[active];
      if (p) pick(p);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 rounded-[10px] bg-[#F4F4F5] text-xs font-medium text-[#111113] outline-none focus:ring-2 focus:ring-[#111113]"
      />
      {open && query.trim() && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-[12px] shadow-xl border border-[#E4E4E7] overflow-hidden">
          {results.length === 0 && <div className="p-3 text-xs text-[#71717A]">Produk tidak ditemukan</div>}
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-3 py-2 text-xs flex justify-between gap-3 ${i === active ? 'bg-[#F4F4F5]' : ''}`}
            >
              <span>
                <span className="font-semibold text-[#111113]">{p.name}</span>
                <span className="block text-[11px] text-[#71717A] font-mono">
                  {p.part_number || p.sku} · stok {p.stock_qty} {p.unit}
                </span>
              </span>
              {pickedIds.includes(p.id) && <span className="text-[10px] font-semibold text-[#16A34A] shrink-0">sudah ditambah</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
