import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Star, X } from 'lucide-react';
import { compressImage } from '../../utils/image';
import { uploadProductPhoto } from '../../utils/api';

const MAX_PHOTOS = 5;

interface Props {
  photos: string[];
  onChange: (photos: string[]) => void;
}

/** Kelola 1–5 foto produk (FOT-01): kamera HP / file, kompres otomatis, foto pertama = foto utama */
export function ProductPhotoManager({ photos, onChange }: Props) {
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Maksimal ${MAX_PHOTOS} foto per produk`);
    setUploading(list.length);
    const added: string[] = [];
    for (const f of list) {
      try {
        const dataUrl = await compressImage(f, 1600);
        const { url } = await uploadProductPhoto(dataUrl);
        added.push(url);
      } catch (err: any) {
        setError(err?.message || 'Gagal mengunggah foto');
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) onChange([...photos, ...added]);
  };

  const makePrimary = (i: number) => onChange([photos[i], ...photos.filter((_, k) => k !== i)]);
  const remove = (i: number) => onChange(photos.filter((_, k) => k !== i));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="font-semibold text-[#111113]">Foto Produk ({photos.length}/{MAX_PHOTOS})</label>
        <span className="text-[11px] text-[#6E6E76]">Foto pertama = foto utama · makin lengkap, cari pakai foto makin akurat</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <div key={url} className="relative w-20 h-20 rounded-[12px] overflow-hidden border border-[#E4E4E7] bg-[#F4F4F5] group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            {i === 0 && <span className="absolute top-1 left-1 text-[9px] font-bold bg-[#111113] text-[#D4FF3F] px-1 rounded">UTAMA</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              {i > 0 ? (
                <button type="button" title="Jadikan foto utama" onClick={() => makePrimary(i)} className="p-0.5 rounded bg-white/90 text-[#111113]">
                  <Star size={12} />
                </button>
              ) : (
                <span />
              )}
              <button type="button" title="Hapus foto" onClick={() => remove(i)} className="p-0.5 rounded bg-white/90 text-[#DC2626]">
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="w-20 h-20 rounded-[12px] border border-dashed border-[#A1A1AA] flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-[#71717A]" />
          </div>
        ))}
        {photos.length + uploading < MAX_PHOTOS && (
          <>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="w-20 h-20 rounded-[12px] border border-dashed border-[#111113] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-[#111113] hover:bg-[#F4F4F5]"
            >
              <Camera size={18} /> Kamera
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-20 h-20 rounded-[12px] border border-dashed border-[#A1A1AA] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-[#5B5B63] hover:bg-[#F4F4F5]"
            >
              <ImagePlus size={18} /> Pilih file
            </button>
          </>
        )}
      </div>
      {error && <p className="text-[11px] text-[#B91C1C] mt-1.5">{error}</p>}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
    </div>
  );
}
