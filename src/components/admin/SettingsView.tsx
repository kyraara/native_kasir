import React, { useEffect, useState } from 'react';
import {
  Settings,
  Database,
  Download,
  Upload,
  RotateCcw,
  Check,
  AlertTriangle,
  Store,
  Printer,
} from 'lucide-react';
import { StoreSettings } from '../../types';
import { PaymentSettings } from './PaymentSettings';
import { exportBackupData, importBackupData, resetToSeed, logout, fetchAIStatus, AIStatus } from '../../utils/api';

interface SettingsViewProps {
  settings: StoreSettings;
  onSaveSettings: (settings: StoreSettings) => void;
  onReloadAllData: () => void;
}

export function SettingsView({
  settings,
  onSaveSettings,
  onReloadAllData,
}: SettingsViewProps) {
  const [formData, setFormData] = useState<StoreSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetchAIStatus().then((s) => alive && setAiStatus(s)).catch(() => {});
    load();
    // Perbarui selama model dimuat / foto sedang diindeks
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleDownloadBackup = async () => {
    let json: string;
    try {
      json = JSON.stringify(await exportBackupData(), null, 2);
    } catch (err: any) {
      alert(`Gagal membuat backup: ${err?.message}`);
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `native_motor_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      if (!window.confirm('Memulihkan backup akan MENGGANTI seluruh data di database saat ini. Lanjutkan?')) return;
      const pw = window.prompt('Ketik password pemilik untuk konfirmasi:');
      if (!pw) return;
      try {
        await importBackupData(JSON.parse(content), pw);
        setImportStatus('Backup berhasil dipulihkan!');
        onReloadAllData();
      } catch (err: any) {
        setImportStatus(`Gagal memulihkan: ${err?.message || 'Format file tidak valid.'}`);
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = async () => {
    if (
      window.confirm(
        'PERINGATAN: Apakah Anda yakin ingin mereset seluruh data kembali ke data contoh bawaan Native Motor?'
      )
    ) {
      const pw = window.prompt('Ketik password pemilik untuk konfirmasi:');
      if (!pw) return;
      try {
        await resetToSeed(pw);
        onReloadAllData();
        alert('Data berhasil direset ke contoh default bawaan.');
      } catch (err: any) {
        alert(`Gagal mereset data: ${err?.message}`);
      }
    }
  };

  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Top Header */}
      <div className="panel p-5">
        <h2 className="text-2xl font-semibold tracking-tight text-[#111113]">
          Pengaturan Toko & Keamanan Data
        </h2>
        <p className="text-xs text-[#5B5B63] mt-0.5">
          Profil toko, format cetak struk thermal 58mm, backup database, dan pemulihan data
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Left: Store Settings Form */}
        <div className="md:col-span-7 panel p-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] mb-4">
            <div className="flex items-center gap-2">
              <Store size={18} className="text-[#111113]" />
              <h3 className="font-semibold text-sm text-[#111113]">Profil Toko & Informasi Struk</h3>
            </div>
            {savedSuccess && (
              <span className="text-xs text-[#16A34A] font-semibold flex items-center gap-1">
                <Check size={14} /> Tersimpan
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#111113] block mb-1">Nama Toko</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-semibold text-[#111113] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111113] block mb-1">Logo Badge Singkat</label>
                <input
                  type="text"
                  maxLength={4}
                  value={formData.logo_badge}
                  onChange={(e) => setFormData({ ...formData, logo_badge: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-bold text-[#111113] outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="font-semibold text-[#111113] block mb-1">Alamat Toko</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] text-[#111113] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111113] block mb-1">Kota / Domisili</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] text-[#111113] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111113] block mb-1">No. WhatsApp Toko</label>
                <input
                  type="text"
                  value={formData.wa}
                  onChange={(e) => setFormData({ ...formData, wa: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono text-[#111113] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111113] block mb-1">Lebar Kertas Printer Thermal</label>
                <select
                  value={formData.receipt_paper}
                  onChange={(e) => setFormData({ ...formData, receipt_paper: e.target.value === '80' ? '80' : '58' })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] text-[#111113] outline-none"
                >
                  <option value="58">58 mm</option>
                  <option value="80">80 mm</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="font-semibold text-[#111113] block mb-1">
                  Header Struk (baris pertama = nama toko; kosongkan untuk pakai profil toko)
                </label>
                <textarea
                  rows={2}
                  value={formData.receipt_header}
                  onChange={(e) => setFormData({ ...formData, receipt_header: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono text-xs text-[#111113] outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="font-semibold text-[#111113] block mb-1">
                  Footer Struk (Kebijakan garansi / penukaran barang)
                </label>
                <textarea
                  rows={2}
                  value={formData.receipt_footer}
                  onChange={(e) => setFormData({ ...formData, receipt_footer: e.target.value })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono text-xs text-[#111113] outline-none"
                />
              </div>
            </div>

            <div className="pt-4 mt-2 border-t border-[#E4E4E7] grid grid-cols-2 gap-4">
              <div className="col-span-2 font-semibold text-sm text-[#111113]">Aturan Stok & AI</div>
              <div>
                <label className="font-semibold text-[#111113] block mb-1">Dead stock jika tidak terjual (hari)</label>
                <input
                  type="number"
                  min={7}
                  value={formData.dead_stock_days}
                  onChange={(e) => setFormData({ ...formData, dead_stock_days: Math.max(7, parseInt(e.target.value, 10) || 90) })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono text-[#111113] outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-[#111113] block mb-1">Kuota AI Gemini per hari</label>
                <input
                  type="number"
                  min={0}
                  value={formData.ai_daily_quota}
                  onChange={(e) => setFormData({ ...formData, ai_daily_quota: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-full px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono text-[#111113] outline-none"
                />
                <p className="text-[10px] text-[#6E6E76] mt-1">0 = matikan Gemini; kemiripan foto tetap jalan.</p>
              </div>
              <label className="col-span-2 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.allow_negative_stock}
                  onChange={(e) => setFormData({ ...formData, allow_negative_stock: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <b className="text-[#111113]">Izinkan jual walau stok di sistem kurang</b>
                  <span className="block text-[#6E6E76]">Stok jadi minus dan perlu dicek saat opname. Matikan agar kasir menolak transaksi.</span>
                </span>
              </label>
              <label className="col-span-2 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.ai_save_reference}
                  onChange={(e) => setFormData({ ...formData, ai_save_reference: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <b className="text-[#111113]">Simpan foto pelanggan sebagai referensi saat memilih "Ini barangnya"</b>
                  <span className="block text-[#6E6E76]">Membuat cari pakai foto makin akurat. Foto pencarian lain dihapus otomatis setelah 30 hari.</span>
                </span>
              </label>
            </div>

            <PaymentSettings value={formData} onChange={setFormData} />

            <button
              type="submit"
              className="mt-2 py-2.5 rounded-[12px] bg-[#111113] text-white hover:bg-[#27272A] font-semibold text-xs transition-colors self-end px-6 shadow-sm"
            >
              Simpan Perubahan
            </button>
          </form>
        </div>

        {/* Right: Backup & Reset Data */}
        <div className="md:col-span-5 flex flex-col gap-3">
          {/* Status AI */}
          <div className="panel p-6 flex flex-col gap-2 text-xs">
            <h3 className="font-semibold text-sm text-[#111113] pb-2 border-b border-[#E4E4E7]">Status Cari Pakai Foto</h3>
            {!aiStatus ? (
              <p className="text-[#6E6E76]">Memuat…</p>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-[#5B5B63]">Kemiripan foto (lokal)</span>
                  <b className={aiStatus.vision.status === 'ready' ? 'text-[#16A34A]' : aiStatus.vision.status === 'error' ? 'text-[#DC2626]' : 'text-[#D97706]'}>
                    {{ ready: 'Siap', loading: 'Memuat model…', idle: 'Belum dimuat', error: 'Gagal', disabled: 'Dimatikan' }[aiStatus.vision.status] || aiStatus.vision.status}
                  </b>
                </div>
                {aiStatus.vision.error && <p className="text-[11px] text-[#DC2626]">{aiStatus.vision.error}</p>}
                <div className="flex justify-between">
                  <span className="text-[#5B5B63]">Foto terindeks</span>
                  <b>
                    {aiStatus.vision.photos_indexed} / {aiStatus.vision.photos_total}
                    {aiStatus.vision.photos_pending > 0 && ` (${aiStatus.vision.photos_pending} antre)`}
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5B5B63]">Gemini ({aiStatus.gemini.model})</span>
                  <b className={aiStatus.gemini.has_key ? 'text-[#16A34A]' : 'text-[#DC2626]'}>{aiStatus.gemini.has_key ? 'Aktif' : 'API key belum diisi'}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5B5B63]">Pemakaian AI hari ini</span>
                  <b>
                    {aiStatus.gemini.used_today} / {aiStatus.gemini.daily_quota}
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5B5B63]">Pencarian 30 hari</span>
                  <b>
                    {aiStatus.accuracy.searches_30d} cari · {aiStatus.accuracy.chosen_30d} dipilih
                    {aiStatus.accuracy.chosen_30d > 0 &&
                      ` · ${Math.round((aiStatus.accuracy.visual_top5_hits / aiStatus.accuracy.chosen_30d) * 100)}% ada di 5 foto termirip`}
                  </b>
                </div>
              </>
            )}
          </div>

          {/* Backup card */}
          <div className="panel p-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[#E4E4E7]">
              <Database size={18} className="text-[#111113]" />
              <h3 className="font-semibold text-sm text-[#111113]">Backup & Pemulihan JSON</h3>
            </div>
            <p className="text-xs text-[#5B5B63]">
              Simpan seluruh database produk, transaksi penjualan kasir, hutang supplier, dan mutasi stok ke file JSON di komputer Anda.
              File foto produk tersimpan terpisah di folder <span className="font-mono">uploads/</span> pada server — salin folder itu juga saat membuat cadangan.
            </p>

            <button
              onClick={handleDownloadBackup}
              className="py-2.5 rounded-[12px] bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#111113] font-semibold text-xs flex items-center justify-center gap-2 transition-colors border border-[#E4E4E7]"
            >
              <Download size={14} />
              <span>Download Backup Lengkap (JSON)</span>
            </button>

            <div className="pt-2">
              <label className="text-xs font-semibold text-[#111113] block mb-1">
                Pulihkan Data dari File Backup
              </label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="w-full text-xs text-[#5B5B63] file:mr-2 file:py-1.5 file:px-3 file:rounded-[8px] file:border-0 file:text-xs file:font-semibold file:bg-[#111113] file:text-white hover:file:bg-[#27272A]"
              />
              {importStatus && (
                <p className="text-xs font-medium text-[#16A34A] mt-2">{importStatus}</p>
              )}
            </div>
          </div>

          {/* Reset seed card */}
          <div className="panel p-6 border border-[#FEE2E2]">
            <div className="flex items-center gap-2 text-[#DC2626] font-semibold text-sm mb-2">
              <AlertTriangle size={18} />
              <h4>Reset Data Contoh</h4>
            </div>
            <p className="text-xs text-[#6E6E76] mb-4">
              Kembalikan semua katalog produk, stok, dan contoh faktur ke konfigurasi awal Native Motor.
            </p>
            <button
              onClick={handleResetData}
              className="py-2.5 px-4 rounded-[12px] bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#B91C1C] font-semibold text-xs flex items-center justify-center gap-2 transition-colors w-full"
            >
              <RotateCcw size={14} />
              <span>Reset ke Data Awal Toko</span>
            </button>
          </div>

          <div className="panel p-6">
            <h4 className="font-semibold text-sm text-[#111113] mb-1">Sesi Login</h4>
            <p className="text-xs text-[#6E6E76] mb-4">Keluar dari aplikasi di perangkat ini.</p>
            <button
              onClick={logout}
              className="py-2.5 px-4 rounded-[12px] bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#111113] font-semibold text-xs w-full border border-[#E4E4E7]"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
