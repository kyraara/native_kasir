import React, { useState } from 'react';
import { CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import type { QueuedSale } from '../../utils/offline';
import { formatDateTimeIndo, formatRupiah } from '../../utils/pricing';

interface Props {
  offlineSince: string | null;
  queue: QueuedSale[];
  onSyncNow: () => void;
  onRetryFailed: () => void;
  onDiscard: (clientRef: string) => void;
}

/** Status offline & antrean transaksi yang belum terkirim ke server */
export function OfflineBanner({ offlineSince, queue, onSyncNow, onRetryFailed, onDiscard }: Props) {
  const [open, setOpen] = useState(false);
  const failed = queue.filter((q) => q.error);
  if (!offlineSince && queue.length === 0) return null;

  const total = (q: QueuedSale) => q.params.items.reduce((a, i) => a + i.price * i.qty - i.discount, 0) - (q.params.discount || 0);

  return (
    <div className="fixed bottom-24 lg:bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[min(95vw,560px)]">
      <div className={`rounded-[14px] shadow-2xl text-xs ${failed.length ? 'bg-[#7F1D1D]' : 'bg-[#111113]'} text-white`}>
        <button onClick={() => setOpen(!open)} className="w-full px-4 py-2.5 flex items-center gap-2 text-left">
          {failed.length ? <AlertTriangle size={15} className="text-[#FCA5A5] shrink-0" /> : <CloudOff size={15} className="text-[#D4FF3F] shrink-0" />}
          <span className="flex-1">
            {offlineSince ? (
              <>
                <b>Offline</b> — memakai data tersimpan {formatDateTimeIndo(offlineSince)}. Kasir tetap bisa transaksi.
              </>
            ) : (
              <b>Online kembali</b>
            )}
            {queue.length > 0 && (
              <span className="block text-[#D4D4D8]">
                {queue.length - failed.length} transaksi menunggu dikirim
                {failed.length > 0 && ` · ${failed.length} ditolak server, perlu dicek`}
              </span>
            )}
          </span>
          {!offlineSince && queue.length > 0 && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onSyncNow();
              }}
              className="px-2.5 py-1 rounded-[8px] bg-[#D4FF3F] text-[#111113] font-semibold flex items-center gap-1"
            >
              <RefreshCw size={12} /> Kirim
            </span>
          )}
        </button>
        {open && queue.length > 0 && (
          <div className="px-4 pb-3 flex flex-col gap-1.5 max-h-60 overflow-y-auto border-t border-white/10 pt-2">
            {queue.map((q) => (
              <div key={q.client_ref} className="flex items-center gap-2">
                <span className="font-mono">{q.temp_number}</span>
                <span className="text-[#A1A1AA]">{formatDateTimeIndo(q.created_at)}</span>
                <span className="ml-auto font-mono">{formatRupiah(total(q))}</span>
                {q.error && (
                  <button
                    onClick={() => window.confirm(`Buang transaksi ${q.temp_number}? Stok tidak akan dikurangi.`) && onDiscard(q.client_ref)}
                    className="px-2 py-0.5 rounded bg-white/10"
                  >
                    Buang
                  </button>
                )}
              </div>
            ))}
            {failed.map((q) => (
              <p key={`e-${q.client_ref}`} className="text-[#FCA5A5]">
                {q.temp_number}: {q.error}
              </p>
            ))}
            {failed.length > 0 && (
              <button onClick={onRetryFailed} className="self-start mt-1 px-2.5 py-1 rounded-[8px] bg-white text-[#111113] font-semibold">
                Coba kirim ulang yang ditolak
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
