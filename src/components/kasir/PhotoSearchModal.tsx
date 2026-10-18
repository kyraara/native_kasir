import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Upload, X, Sparkles, Search, Check, AlertCircle, Plus, Crop, RefreshCw, Loader2, Image as ImageIcon, ClipboardList } from 'lucide-react';
import type { Product, StoreSettings } from '../../types';
import { StatusDot, PartTypeBadge } from '../common/Badge';
import { formatRupiah } from '../../utils/pricing';
import { compressImage, cropImage } from '../../utils/image';
import { photoSearch, readSearchPhoto, choosePhotoResult, PhotoSearchResult, PhotoReadResult } from '../../utils/api';
import { mergeCandidates, defaultQuery } from '../../utils/photoMatch';
import { EmptyState } from '../common/Brand';

interface PhotoSearchModalProps {
  products: Product[];
  settings: StoreSettings;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onRequestProduct: (description: string, photoUrl?: string) => void;
}

type Rect = { x: number; y: number; w: number; h: number };

const LEVEL_STYLE = {
  'Sangat mirip': 'bg-[#111113] text-[#D4FF3F]',
  Mirip: 'bg-[#DCFCE7] text-[#166534]',
  Mungkin: 'bg-[#F4F4F5] text-[#5B5B63]',
} as const;

export function PhotoSearchModal({ products, settings, onClose, onAddToCart, onRequestProduct }: PhotoSearchModalProps) {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoSearchResult | null>(null);
  const [aiRead, setAiRead] = useState<PhotoReadResult | null>(null);
  const [reading, setReading] = useState(false);
  // Abaikan bacaan AI dari pencarian sebelumnya bila pengguna sudah mencari foto lain
  const searchSeq = useRef(0);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saveReference, setSaveReference] = useState(settings.ai_save_reference !== false);
  const [requestSaved, setRequestSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Crop
  const [cropMode, setCropMode] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const imgBoxRef = useRef<HTMLDivElement>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const loadImage = async (blob: Blob) => {
    setError(null);
    try {
      // Cukup 1024 px untuk dikenali; upload lebih cepat lewat jaringan toko
      const dataUrl = await compressImage(blob, 1024, 0.85);
      setImage(dataUrl);
      setResult(null);
      setRejected(new Set());
      setRect(null);
      setCropMode(false);
    } catch (err: any) {
      setError(err?.message || 'Gambar tidak bisa dibaca');
    }
  };

  // Tempel gambar dari WhatsApp Web (Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        loadImage(file);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const runSearch = async (src: string) => {
    if (!navigator.onLine) {
      setError('Sedang offline — cari pakai foto butuh internet. Pencarian teks tetap bisa dipakai.');
      return;
    }
    const seq = ++searchSeq.current;
    setBusy(true);
    setError(null);
    setAiRead(null);
    setQuery('');
    let res: PhotoSearchResult;
    try {
      // Tahap 1: kemiripan foto — cepat, langsung tampil
      res = await photoSearch(src);
      if (seq !== searchSeq.current) return;
      setResult(res);
      setRejected(new Set());
    } catch (err: any) {
      setError(err?.message || 'Pencarian gagal');
      return;
    } finally {
      setBusy(false);
    }
    // Tahap 2: pembacaan AI menyusul, lalu urutan kandidat diperbarui
    setReading(true);
    try {
      const read = await readSearchPhoto(res.log_id);
      if (seq !== searchSeq.current) return;
      setAiRead(read);
      setQuery((q) => q || defaultQuery(read.reading));
    } catch (err: any) {
      if (seq === searchSeq.current) setAiRead({ reading: null, reading_error: err?.message || 'AI tidak bisa membaca foto' });
    } finally {
      if (seq === searchSeq.current) setReading(false);
    }
  };

  const applyCropAndSearch = async () => {
    if (!image) return;
    let src = image;
    if (rect && rect.w > 0.03 && rect.h > 0.03) {
      src = await cropImage(image, rect);
      setImage(src);
    }
    setRect(null);
    setCropMode(false);
    runSearch(src);
  };

  // Gambar kotak crop dengan mouse / jari
  const relPos = (e: React.PointerEvent) => {
    const box = imgBoxRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) };
  };

  const candidates = useMemo(
    () =>
      result
        ? mergeCandidates(
            products.filter((p) => !rejected.has(p.id)),
            result.visual,
            aiRead?.reading || null,
            query
          )
        : [],
    [products, result, aiRead, query, rejected]
  );

  const pick = async (p: Product) => {
    onAddToCart(p);
    if (result) {
      // Catat pilihan (akurasi) & simpan foto sebagai referensi; gagal pun tidak menghalangi kasir
      choosePhotoResult(result.log_id, p.id, saveReference).catch(() => {});
    }
    onClose();
  };

  const recordRequest = () => {
    const r = aiRead?.reading;
    const desc = `Dicari pelanggan (foto): ${r?.part_type || 'sparepart'}${r?.part_number_ocr ? ` · PN ${r.part_number_ocr}` : ''}${
      r?.estimated_motor?.length ? ` · ${r.estimated_motor.join(', ')}` : ''
    }${query ? ` · kata kunci "${query}"` : ''}`;
    onRequestProduct(desc, image || undefined);
    setRequestSaved(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6" onClick={onClose}>
      <div className="bg-[#ECEDEF] rounded-[24px] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 px-6 bg-white border-b border-[#E4E4E7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] bg-[#0E0E10] text-[#D4FF3F] flex items-center justify-center">
              <Camera size={16} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#111113]">Cari Pakai Foto</h3>
              <p className="text-[11px] text-[#6E6E76]">Foto dari kamera, file, seret ke sini, atau tempel dari WhatsApp Web (Ctrl+V). Anda yang memilih barangnya.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[#F4F4F5] text-[#71717A]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Kiri: foto & bacaan AI */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <div
              className={`panel p-3 flex flex-col gap-3 ${dragOver ? 'ring-2 ring-[#111113]' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'));
                if (f) loadImage(f);
              }}
            >
              {image ? (
                <div
                  ref={imgBoxRef}
                  className={`relative rounded-[14px] overflow-hidden bg-[#F4F4F5] select-none ${cropMode ? 'cursor-crosshair touch-none' : ''}`}
                  onPointerDown={(e) => {
                    if (!cropMode) return;
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    dragStart.current = relPos(e);
                    setRect({ ...dragStart.current, w: 0, h: 0 });
                  }}
                  onPointerMove={(e) => {
                    if (!cropMode || !dragStart.current) return;
                    const p = relPos(e);
                    const s = dragStart.current;
                    setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
                  }}
                  onPointerUp={() => (dragStart.current = null)}
                >
                  <img src={image} alt="Foto pelanggan" className="w-full max-h-72 object-contain pointer-events-none" draggable={false} />
                  {cropMode && rect && (
                    <div
                      className="absolute border-2 border-[#D4FF3F] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                      style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
                    />
                  )}
                  {busy && (
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-xs gap-2">
                      <Loader2 size={22} className="animate-spin" /> Mencari…
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-56 rounded-[14px] border-2 border-dashed border-[#A1A1AA] flex flex-col items-center justify-center gap-2 text-[#6E6E76] text-xs text-center p-4">
                  <ImageIcon size={28} />
                  <span>Seret foto ke sini, atau tekan Ctrl+V untuk menempel dari WhatsApp Web</span>
                </div>
              )}

              {cropMode && <p className="text-[11px] text-[#5B5B63]">Tarik kotak di sekitar barangnya, lalu tekan "Potong & Cari".</p>}

              <div className="flex flex-wrap gap-2">
                <button onClick={() => cameraRef.current?.click()} className="px-3 py-2 rounded-[10px] bg-[#111113] text-white text-xs font-semibold flex items-center gap-1.5">
                  <Camera size={14} /> Kamera
                </button>
                <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-[10px] bg-white border border-[#E4E4E7] text-xs font-semibold flex items-center gap-1.5">
                  <Upload size={14} /> Pilih file
                </button>
                {image && !cropMode && (
                  <button onClick={() => setCropMode(true)} className="px-3 py-2 rounded-[10px] bg-white border border-[#E4E4E7] text-xs font-semibold flex items-center gap-1.5">
                    <Crop size={14} /> Potong
                  </button>
                )}
                {image && (
                  <button
                    disabled={busy}
                    onClick={cropMode ? applyCropAndSearch : () => runSearch(image)}
                    className="ml-auto px-4 py-2 rounded-[10px] bg-[#D4FF3F] text-[#111113] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Search size={14} /> {cropMode ? 'Potong & Cari' : result ? 'Cari Ulang' : 'Cari'}
                  </button>
                )}
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (e.target.files?.[0] && loadImage(e.target.files[0]), (e.target.value = ''))} />
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => (e.target.files?.[0] && loadImage(e.target.files[0]), (e.target.value = ''))} />
            </div>

            {error && (
              <div className="p-3 rounded-[14px] bg-[#FEE2E2] text-[#B91C1C] text-xs flex gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}

            {result && (
              <div className="panel-ink p-4 flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-2 text-[#D4FF3F] font-semibold">
                  <Sparkles size={14} /> AI membaca:
                </div>
                {reading ? (
                  <div className="text-[#A1A1AA] flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin" /> AI sedang membaca foto… (kandidat dari kemiripan foto sudah tampil)
                  </div>
                ) : aiRead?.reading ? (
                  <>
                    <div className="text-white font-semibold text-sm">{aiRead.reading.part_type || '—'}</div>
                    {aiRead.reading.raw_description && <div className="text-[#A1A1AA]">{aiRead.reading.raw_description}</div>}
                    {aiRead.reading.features.length > 0 && <div className="text-[#D4D4D8]">Ciri: {aiRead.reading.features.join(', ')}</div>}
                    <div className="text-[#D4D4D8]">
                      Part number terbaca: <b className="text-white font-mono">{aiRead.reading.part_number_ocr || 'tidak terbaca'}</b>
                    </div>
                    {aiRead.reading.brand && <div className="text-[#D4D4D8]">Merek: {aiRead.reading.brand}</div>}
                    {aiRead.reading.estimated_motor.length > 0 && <div className="text-[#D4D4D8]">Perkiraan motor: {aiRead.reading.estimated_motor.join(', ')}</div>}
                  </>
                ) : (
                  <div className="text-[#FBBF24]">{aiRead?.reading_error || 'AI tidak membaca foto.'}</div>
                )}
                {result.visual_error && <div className="text-[#FBBF24]">{result.visual_error}</div>}

                <label className="mt-1 flex flex-col gap-1">
                  <span className="text-[#A1A1AA]">Kata kunci (bisa diubah):</span>
                  <div className="flex gap-1.5">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="mis. kampas rem beat"
                      className="flex-1 px-3 py-2 rounded-[10px] bg-[#1C1C1F] border border-[#2A2A2E] text-white outline-none focus:border-[#D4FF3F]"
                    />
                    <span className="px-2.5 py-2 rounded-[10px] bg-[#2A2A2E] text-[#A1A1AA] flex items-center" title="Hasil diperbarui otomatis saat kata kunci diubah">
                      <RefreshCw size={13} />
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Kanan: kandidat */}
          <div className="md:col-span-7 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm text-[#111113]">{result ? `Kandidat (${candidates.length})` : 'Kandidat'}</h4>
              <label className="flex items-center gap-1.5 text-[11px] text-[#5B5B63] cursor-pointer" title="Foto pelanggan disimpan sebagai foto referensi produk yang Anda pilih, agar pencarian berikutnya lebih akurat">
                <input type="checkbox" checked={saveReference} onChange={(e) => setSaveReference(e.target.checked)} />
                Simpan foto sebagai referensi
              </label>
            </div>

            {!result && !busy && (
              <div className="panel">
                <EmptyState mascot="pencarian-kosong" title="Belum ada foto" description="Ambil atau tempel foto, lalu tekan Cari. Hasil tampil di sini (maks. 5 kandidat)." />
              </div>
            )}

            {candidates.map((c) => {
              const p = c.product;
              const status = p.stock_qty <= 0 ? 'out' : p.stock_qty <= p.min_stock ? 'low' : 'safe';
              return (
                <div key={p.id} className="panel p-3 flex flex-col gap-2">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-[12px] overflow-hidden bg-[#F4F4F5] border border-[#E4E4E7] shrink-0 flex items-center justify-center">
                      {p.photos[0] ? <img src={p.photos[0]} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={18} className="text-[#A1A1AA]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold ${LEVEL_STYLE[c.match_level]}`}>{c.match_level}</span>
                        <PartTypeBadge type={p.part_type} />
                      </div>
                      <div className="font-semibold text-xs text-[#111113] mt-1">{p.name}</div>
                      <div className="text-[11px] text-[#6E6E76] font-mono">
                        {p.part_number || p.sku} · Rak {p.rack_location || '-'}
                      </div>
                      <div className="text-[11px] text-[#5B5B63] mt-0.5">{c.reason}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-sm num">{formatRupiah(p.sell_price)}</div>
                      <div className="text-[11px] flex items-center justify-end gap-1 mt-0.5">
                        <StatusDot status={status} /> stok {p.stock_qty}
                      </div>
                    </div>
                  </div>
                  {expanded === p.id && (
                    <div className="text-[11px] text-[#5B5B63] bg-[#F4F4F5] rounded-[10px] p-2.5">
                      <div>
                        {p.brand} · {p.category}
                      </div>
                      <div>Cocok: {p.fitments.map((f) => `${f.brand} ${f.model} ${f.year_from}-${f.year_to}`).join('; ') || '-'}</div>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={() => pick(p)} className="flex-1 py-2 rounded-[10px] bg-[#111113] text-white text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Check size={13} /> Ini barangnya — Tambah
                    </button>
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] text-xs font-semibold">
                      Detail
                    </button>
                    <button onClick={() => setRejected(new Set([...rejected, p.id]))} className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] text-[#B91C1C] text-xs font-semibold">
                      Bukan ini
                    </button>
                  </div>
                </div>
              );
            })}

            {result && (
              <div className="panel p-4 text-xs flex flex-col gap-2">
                <div className="text-[#5B5B63]">
                  {candidates.length === 0 ? 'Tidak ada barang yang cocok di katalog.' : 'Barangnya tidak ada atau stok habis?'}
                </div>
                <button
                  disabled={requestSaved}
                  onClick={recordRequest}
                  className="self-start px-3 py-2 rounded-[10px] bg-[#FEF3C7] text-[#92400E] font-semibold flex items-center gap-1.5 disabled:opacity-60"
                >
                  {requestSaved ? <Check size={13} /> : <ClipboardList size={13} />}
                  {requestSaved ? 'Tercatat di daftar Perlu Dibeli' : 'Catat permintaan pelanggan'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
