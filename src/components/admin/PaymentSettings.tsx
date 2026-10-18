import React, { useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import type { StoreSettings } from '../../types';
import { compressImage } from '../../utils/image';
import { uploadProductPhoto } from '../../utils/api';
import { inspectQris, makeDynamicQris, QrisInfo } from '../../utils/qris';
import { decodeQrFromFile, qrDataUrl } from '../../utils/qrImage';

interface Props {
  value: StoreSettings;
  onChange: (s: StoreSettings) => void;
}

/** QRIS statis & rekening transfer yang ditampilkan di layar bayar kasir */
export function PaymentSettings({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const accounts = value.bank_accounts || [];

  const [qrisError, setQrisError] = useState<string | null>(null);
  const [testQr, setTestQr] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  let qrisInfo: QrisInfo | null = null;
  try {
    qrisInfo = value.qris_payload ? inspectQris(value.qris_payload) : null;
  } catch {
    qrisInfo = null;
  }

  const setPayload = (payload: string) => {
    setTestQr(null);
    if (!payload.trim()) {
      setQrisError(null);
      onChange({ ...value, qris_payload: '' });
      return;
    }
    try {
      inspectQris(payload);
      setQrisError(null);
      onChange({ ...value, qris_payload: payload.trim() });
    } catch (err: any) {
      setQrisError(err?.message || 'Kode QRIS tidak valid');
    }
  };

  const uploadQris = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setQrisError(null);
    setTestQr(null);
    try {
      // 1) Baca isi QR dari foto asli (sebelum dikompres) supaya nominal bisa diisi otomatis
      const text = await decodeQrFromFile(file).catch(() => null);
      let payload = value.qris_payload;
      if (text) {
        try {
          inspectQris(text);
          payload = text.trim();
        } catch (err: any) {
          setQrisError(`QR terbaca tapi bukan QRIS yang valid: ${err?.message}`);
        }
      } else {
        setQrisError('QR tidak terbaca dari foto. Coba screenshot QRIS dari aplikasi DANA Bisnis (lebih jelas), atau tempel teks QRIS manual.');
      }
      // 2) Simpan gambarnya juga (cadangan jika nominal otomatis tidak dipakai)
      const { url } = await uploadProductPhoto(await compressImage(file, 1200, 0.95));
      onChange({ ...value, qris_image_url: url, qris_payload: payload });
    } catch (err: any) {
      alert(err?.message || 'Gagal mengunggah QRIS');
    } finally {
      setUploading(false);
    }
  };

  const showTestQr = async () => setTestQr(await qrDataUrl(makeDynamicQris(value.qris_payload, 1000)));

  const setAccount = (i: number, patch: Partial<StoreSettings['bank_accounts'][number]>) =>
    onChange({ ...value, bank_accounts: accounts.map((a, k) => (k === i ? { ...a, ...patch } : a)) });

  return (
    <div className="pt-4 mt-2 border-t border-[#E4E4E7] flex flex-col gap-3">
      <div className="font-semibold text-sm text-[#111113]">Pembayaran (tampil di layar bayar kasir)</div>

      <div className="flex gap-4 items-start">
        <div className="w-28 h-28 rounded-[12px] bg-[#F4F4F5] border border-[#E4E4E7] flex items-center justify-center overflow-hidden shrink-0">
          {value.qris_image_url ? (
            <img src={value.qris_image_url} alt="QRIS" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px] text-[#71717A] text-center px-2">Belum ada QRIS</span>
          )}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <p className="text-[#5B5B63]">
            Unggah QRIS statis toko (mis. dari aplikasi <b>DANA Bisnis</b> → screenshot QRIS). Isinya dibaca otomatis supaya di kasir
            muncul <b>QRIS dengan nominal terisi</b> sesuai total belanja.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-[10px] bg-[#111113] text-white font-semibold flex items-center gap-1.5">
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {value.qris_image_url || value.qris_payload ? 'Ganti QRIS' : 'Unggah QRIS'}
            </button>
            <button type="button" onClick={() => setManualOpen(!manualOpen)} className="px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-semibold">
              Tempel teks QRIS
            </button>
            {(value.qris_image_url || value.qris_payload) && (
              <button
                type="button"
                onClick={() => {
                  setTestQr(null);
                  onChange({ ...value, qris_image_url: '', qris_payload: '' });
                }}
                className="px-3 py-2 rounded-[10px] bg-[#FEE2E2] text-[#B91C1C] font-semibold"
              >
                Hapus
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => (uploadQris(e.target.files?.[0]), (e.target.value = ''))} />

          {manualOpen && (
            <textarea
              rows={3}
              defaultValue={value.qris_payload}
              onBlur={(e) => setPayload(e.target.value)}
              placeholder="00020101021126…6304XXXX"
              className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono text-[11px] outline-none break-all"
            />
          )}

          {qrisInfo ? (
            <div className="p-2.5 rounded-[10px] bg-[#DCFCE7] text-[#166534] flex flex-col gap-1.5">
              <span>
                ✓ Nominal otomatis aktif — <b>{qrisInfo.merchantName || 'merchant'}</b>
                {qrisInfo.city && ` · ${qrisInfo.city}`}
              </span>
              <button type="button" onClick={showTestQr} className="self-start px-2.5 py-1 rounded-[8px] bg-white text-[#111113] font-semibold">
                Tes scan Rp 1.000
              </button>
              {testQr && (
                <div className="flex gap-3 items-center">
                  <img src={testQr} alt="QR uji Rp 1.000" className="w-36 h-36 bg-white rounded-[8px]" />
                  <span className="text-[#166534]">
                    Scan dengan aplikasi e-wallet/m-banking lain. Pastikan nominal muncul <b>Rp 1.000</b> dan nama penerima benar. Tidak perlu dibayar.
                  </span>
                </div>
              )}
            </div>
          ) : (
            value.qris_image_url && !qrisError && <span className="text-[#92400E]">Nominal otomatis belum aktif — pembeli perlu mengetik nominal sendiri.</span>
          )}
          {qrisError && <span className="text-[#B91C1C]">{qrisError}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-semibold text-[#111113]">Rekening transfer</span>
        {accounts.map((acc, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input value={acc.bank} onChange={(e) => setAccount(i, { bank: e.target.value })} placeholder="Bank (mis. BCA)" className="col-span-3 px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none" />
            <input value={acc.number} onChange={(e) => setAccount(i, { number: e.target.value })} placeholder="No. rekening" className="col-span-4 px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono outline-none" />
            <input value={acc.holder} onChange={(e) => setAccount(i, { holder: e.target.value })} placeholder="Atas nama" className="col-span-4 px-3 py-2 rounded-[10px] bg-[#F4F4F5] outline-none" />
            <button
              type="button"
              onClick={() => onChange({ ...value, bank_accounts: accounts.filter((_, k) => k !== i) })}
              className="col-span-1 rounded-[10px] text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center"
              title="Hapus rekening"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...value, bank_accounts: [...accounts, { bank: '', number: '', holder: value.name }] })}
          className="self-start px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-semibold flex items-center gap-1.5"
        >
          <Plus size={13} /> Tambah rekening
        </button>
      </div>
    </div>
  );
}
