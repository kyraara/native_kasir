import React, { useState } from 'react';
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
  Search,
} from 'lucide-react';
import { Product, OpnameSession, OpnameItem } from '../../types';
import { formatRupiah } from '../../utils/pricing';

interface OpnameViewProps {
  products: Product[];
  sessions: OpnameSession[];
  onFinalizeSession: (sessionId: string) => void;
  onSaveSession: (session: OpnameSession) => void;
}

export function OpnameView({
  products,
  sessions,
  onFinalizeSession,
  onSaveSession,
}: OpnameViewProps) {
  const [activeSession, setActiveSession] = useState<OpnameSession | null>(() => {
    return sessions.find((s) => s.status === 'open') || null;
  });
  const [opnameScope, setOpnameScope] = useState<'all' | 'category' | 'rack'>('all');
  const [filterQuery, setFilterQuery] = useState('');

  const handleStartNewSession = () => {
    const items: OpnameItem[] = products.map((p) => ({
      product_id: p.id,
      product_name: p.name,
      rack_location: p.rack_location,
      system_qty: p.stock_qty,
      counted_qty: p.stock_qty, // defaults to system for quick spot checks
      unit_cost: p.avg_cost,
    }));

    const newSession: OpnameSession = {
      id: `opn-${Date.now()}`,
      number: `OPN-${new Date().toISOString().slice(2, 4)}${String(
        new Date().getMonth() + 1
      ).padStart(2, '0')}-${String(sessions.length + 1).padStart(3, '0')}`,
      scope: opnameScope,
      status: 'open',
      started_at: new Date().toISOString(),
      items,
    };

    onSaveSession(newSession);
    setActiveSession(newSession);
  };

  const handleUpdateItemCount = (productId: string, count: number) => {
    if (!activeSession) return;
    const updatedItems = activeSession.items.map((it) =>
      it.product_id === productId ? { ...it, counted_qty: count } : it
    );
    const updatedSession = { ...activeSession, items: updatedItems };
    setActiveSession(updatedSession);
    onSaveSession(updatedSession);
  };

  const handleFinalize = () => {
    if (!activeSession) return;
    if (
      window.confirm(
        'Apakah Anda yakin ingin menyelesaikan Stock Opname? Stok sistem akan otomatis disesuaikan dengan stok fisik yang dihitung.'
      )
    ) {
      onFinalizeSession(activeSession.id);
      setActiveSession(null);
    }
  };

  // Discrepancy stats
  const totalItemsCounted = activeSession?.items.length || 0;
  const itemsWithDiscrepancy =
    activeSession?.items.filter((it) => it.counted_qty !== it.system_qty) || [];
  const totalDiffValuation = itemsWithDiscrepancy.reduce(
    (acc, it) => acc + (it.counted_qty - it.system_qty) * it.unit_cost,
    0
  );

  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Top Header */}
      <div className="panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#111113]">
            Stock Opname Fisik
          </h2>
          <p className="text-xs text-[#5B5B63] mt-0.5">
            Pencocokan stok fisik di rak gudang vs stok sistem aplikasi untuk menjaga akurasi &gt; 98%
          </p>
        </div>

        {!activeSession && (
          <button
            onClick={handleStartNewSession}
            className="px-4 py-2.5 rounded-[12px] bg-[#111113] text-white hover:bg-[#27272A] text-xs font-semibold flex items-center gap-2 shadow-md transition-all"
          >
            <Play size={14} className="fill-current" />
            <span>Mulai Sesi Opname Baru</span>
          </button>
        )}
      </div>

      {activeSession ? (
        <div className="panel p-6 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#E4E4E7] gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#DCFCE7] text-[#15803D] text-[10px] font-bold uppercase">
                  Sesi Sedang Berjalan
                </span>
                <span className="font-mono text-xs font-semibold text-[#111113]">
                  {activeSession.number}
                </span>
              </div>
              <p className="text-xs text-[#6E6E76] mt-1">
                Dimulai pada: {new Date(activeSession.started_at).toLocaleTimeString('id-ID')} WIB
              </p>
            </div>

            {/* Discrepancy summary */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[11px] text-[#5B5B63]">Selisih Item:</span>
                <div className="text-base font-bold font-mono text-[#111113]">
                  {itemsWithDiscrepancy.length} produk
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-[#5B5B63]">Nilai Selisih (Rp):</span>
                <div
                  className={`text-base font-bold font-mono ${
                    totalDiffValuation < 0 ? 'text-[#DC2626]' : totalDiffValuation > 0 ? 'text-[#16A34A]' : 'text-[#111113]'
                  }`}
                >
                  {formatRupiah(totalDiffValuation)}
                </div>
              </div>

              <button
                onClick={handleFinalize}
                className="px-5 py-2.5 rounded-[12px] bg-[#D4FF3F] text-[#111113] hover:bg-[#c2ed2e] font-semibold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Check size={16} />
                <span>Finalisasi Opname</span>
              </button>
            </div>
          </div>

          {/* Search table */}
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <input
              type="text"
              placeholder="Cari item di rak saat opname..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-[10px] bg-[#F4F4F5] text-xs font-medium outline-none"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F4F5] text-[#5B5B63] font-semibold text-[11px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Produk</th>
                  <th className="py-2.5 px-3">Lokasi Rak</th>
                  <th className="py-2.5 px-3 text-center">Stok Sistem</th>
                  <th className="py-2.5 px-3 text-center">Stok Fisik Dihitung</th>
                  <th className="py-2.5 px-3 text-center">Selisih</th>
                  <th className="py-2.5 px-3 text-right">Nilai Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {activeSession.items
                  .filter((it) =>
                    it.product_name.toLowerCase().includes(filterQuery.toLowerCase()) ||
                    it.rack_location.toLowerCase().includes(filterQuery.toLowerCase())
                  )
                  .map((it) => {
                    const diff = it.counted_qty - it.system_qty;
                    const diffVal = diff * it.unit_cost;

                    return (
                      <tr key={it.product_id} className="hover:bg-[#F9FAFB]">
                        <td className="py-3 px-3 font-semibold text-[#111113]">
                          {it.product_name}
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-[#111113]">
                          Rak {it.rack_location}
                        </td>
                        <td className="py-3 px-3 text-center font-mono num">
                          {it.system_qty}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            value={it.counted_qty}
                            onChange={(e) =>
                              handleUpdateItemCount(
                                it.product_id,
                                parseInt(e.target.value, 10) || 0
                              )
                            }
                            className="w-20 px-2 py-1 rounded bg-[#F4F4F5] text-center font-mono font-bold text-xs text-[#111113] outline-none border border-transparent focus:border-[#111113]"
                          />
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold num">
                          <span
                            className={
                              diff === 0
                                ? 'text-[#71717A]'
                                : diff > 0
                                ? 'text-[#16A34A]'
                                : 'text-[#DC2626]'
                            }
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold num">
                          <span
                            className={
                              diff === 0
                                ? 'text-[#71717A]'
                                : diff > 0
                                ? 'text-[#16A34A]'
                                : 'text-[#DC2626]'
                            }
                          >
                            {formatRupiah(diffVal)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel p-8 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F4F4F5] flex items-center justify-center text-[#111113]">
            <ClipboardList size={24} />
          </div>
          <h3 className="text-base font-semibold text-[#111113]">Tidak ada sesi Stock Opname aktif</h3>
          <p className="text-xs text-[#6E6E76] max-w-sm">
            Klik tombol di atas untuk memulai hitung fisik stok. Anda bisa membawa HP keliling rak sambil memasukkan jumlah fisik yang sebenarnya.
          </p>
        </div>
      )}
    </div>
  );
}
