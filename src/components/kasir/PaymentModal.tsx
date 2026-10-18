import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  QrCode,
  CreditCard,
  Banknote,
  Copy,
  ChevronLeft,
  User,
  Bike,
} from 'lucide-react';
import { CartItem, PaymentMethod, StoreSettings } from '../../types';
import { inspectQris, makeDynamicQris } from '../../utils/qris';
import { qrDataUrl } from '../../utils/qrImage';
import {
  formatRupiah,
  calculateChange,
  getQuickCashOptions,
} from '../../utils/pricing';

interface PaymentModalProps {
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  invoiceNumber: string;
  customerName: string;
  vehicleNote: string;
  onChangeCustomerName: (name: string) => void;
  onChangeVehicleNote: (note: string) => void;
  settings: StoreSettings;
  onClose: () => void;
  onCompleteSale: (params: {
    method: PaymentMethod;
    cashReceived?: number;
    changeAmount?: number;
  }) => void;
}

export function PaymentModal({
  items,
  subtotal,
  discount,
  total,
  invoiceNumber,
  customerName,
  vehicleNote,
  onChangeCustomerName,
  onChangeVehicleNote,
  settings,
  onClose,
  onCompleteSale,
}: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');

  // QRIS dengan nominal terisi otomatis (dibuat dari QRIS statis toko)
  const [dynamicQr, setDynamicQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const qrisMerchant = (() => {
    try {
      const info = settings.qris_payload ? inspectQris(settings.qris_payload) : null;
      return info ? [info.merchantName, info.city].filter(Boolean).join(' · ') : '';
    } catch {
      return '';
    }
  })();
  useEffect(() => {
    if (method !== 'qris' || !settings.qris_payload || total <= 0) return;
    let alive = true;
    setDynamicQr(null);
    setQrError(null);
    (async () => {
      try {
        const url = await qrDataUrl(makeDynamicQris(settings.qris_payload, total));
        if (alive) setDynamicQr(url);
      } catch (err: any) {
        if (alive) setQrError(`QRIS gagal dibuat: ${err?.message || err}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [method, settings.qris_payload, total]);

  const [cashInput, setCashInput] = useState<string>(String(total));

  const quickCashOptions = getQuickCashOptions(total);
  const numericCash = parseInt(cashInput, 10) || 0;
  const changeAmount = calculateChange(total, numericCash);
  const isCashSufficient = numericCash >= total;

  // Keyboard shortcut listener (Enter to complete, Esc to back)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (method === 'cash') {
          if (isCashSufficient) {
            onCompleteSale({
              method: 'cash',
              cashReceived: numericCash,
              changeAmount,
            });
          }
        } else {
          onCompleteSale({
            method,
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [method, numericCash, isCashSufficient, total, changeAmount, onClose, onCompleteSale]);

  const handleKeypadPress = (val: string) => {
    if (val === 'C') {
      setCashInput('');
    } else if (val === '000') {
      if (cashInput && cashInput !== '0') {
        setCashInput(cashInput + '000');
      }
    } else {
      if (cashInput === '0' || cashInput === String(total)) {
        setCashInput(val);
      } else {
        setCashInput(cashInput + val);
      }
    }
  };

  const handleFinish = () => {
    if (method === 'cash') {
      if (!isCashSufficient) return;
      onCompleteSale({
        method: 'cash',
        cashReceived: numericCash,
        changeAmount,
      });
    } else {
      onCompleteSale({
        method,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-[#ECEDEF] rounded-[22px] sm:rounded-[24px] w-full max-w-4xl shadow-2xl overflow-y-auto md:overflow-hidden flex flex-col md:flex-row max-h-[94vh]">
        {/* Left Panel: Order Summary & Optional Info */}
        <div className="w-full md:w-5/12 bg-white p-4 sm:p-5 md:p-6 flex flex-col justify-between overflow-y-auto border-b md:border-b-0 md:border-r border-[#E4E4E7] shrink-0">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E4E4E7] mb-3">
              <button
                onClick={onClose}
                className="text-xs font-semibold text-[#5B5B63] hover:text-[#111113] flex items-center gap-1.5"
              >
                <ChevronLeft size={16} />
                <span>Kembali (Esc)</span>
              </button>
              <span className="font-mono text-xs text-[#71717A]">{invoiceNumber}</span>
            </div>

            <h3 className="text-base sm:text-lg font-semibold text-[#111113] mb-2 sm:mb-3">Ringkasan Pembelian</h3>

            {/* Items list */}
            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1 text-xs">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between py-1.5 border-b border-[#F4F4F5]"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-medium text-[#111113] truncate">{item.product.name}</p>
                    <p className="text-[11px] text-[#71717A] font-mono">
                      {item.qty} x {formatRupiah(item.price, false)}
                    </p>
                  </div>
                  <span className="font-mono font-semibold text-[#111113] num shrink-0">
                    {formatRupiah(item.qty * item.price - item.discount, false)}
                  </span>
                </div>
              ))}
            </div>

            {/* Calculations */}
            <div className="flex flex-col gap-1.5 pt-3 border-t border-[#E4E4E7] text-xs mt-3">
              <div className="flex justify-between text-[#5B5B63]">
                <span>Subtotal</span>
                <span className="font-mono num">{formatRupiah(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-[#DC2626]">
                  <span>Diskon Total</span>
                  <span className="font-mono num">-{formatRupiah(discount)}</span>
                </div>
              )}
            </div>

            {/* Customer & Bike Info Fields */}
            <div className="mt-5 p-3.5 rounded-[16px] bg-[#F4F4F5] flex flex-col gap-2.5 text-xs">
              <div>
                <label className="font-semibold text-[#111113] flex items-center gap-1 mb-1">
                  <User size={13} />
                  <span>Nama Pembeli (Opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Pelanggan Umum / Langganan"
                  value={customerName}
                  onChange={(e) => onChangeCustomerName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-[8px] bg-white text-[#111113] outline-none font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111113] flex items-center gap-1 mb-1">
                  <Bike size={13} />
                  <span>Motor / Catatan Unit (Opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="misal: Beat FI 2018 Hitam / BG 1234 XY"
                  value={vehicleNote}
                  onChange={(e) => onChangeVehicleNote(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-[8px] bg-white text-[#111113] outline-none font-medium"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Black Panel (`panel-ink`) */}
        <div className="w-full md:w-7/12 bg-[#0E0E10] text-[#F4F4F5] p-4 sm:p-5 md:p-6 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Total Header */}
            <div className="flex justify-between items-start mb-3 sm:mb-4">
              <div>
                <span className="text-[11px] sm:text-xs text-[#A1A1AA] uppercase tracking-wider font-semibold">
                  Total Bayar
                </span>
                <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-white font-mono num mt-0.5">
                  {formatRupiah(total)}
                </div>
              </div>

              {/* Segmented Payment Method Selector */}
              <div className="flex items-center p-0.5 sm:p-1 rounded-[10px] sm:rounded-[12px] bg-[#1C1C1F] border border-[#2A2A2E] text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setMethod('cash')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-[6px] sm:rounded-[8px] transition-all flex items-center gap-1 sm:gap-1.5 text-xs ${
                    method === 'cash'
                      ? 'bg-white text-[#111113] shadow-sm'
                      : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <Banknote size={13} />
                  <span>Tunai</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('qris')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-[6px] sm:rounded-[8px] transition-all flex items-center gap-1 sm:gap-1.5 text-xs ${
                    method === 'qris'
                      ? 'bg-white text-[#111113] shadow-sm'
                      : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <QrCode size={13} />
                  <span>QRIS</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('transfer')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-[6px] sm:rounded-[8px] transition-all flex items-center gap-1 sm:gap-1.5 text-xs ${
                    method === 'transfer'
                      ? 'bg-white text-[#111113] shadow-sm'
                      : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <CreditCard size={13} />
                  <span>Transfer</span>
                </button>
              </div>
            </div>

            {/* TUNAI MODE */}
            {method === 'cash' && (
              <div className="flex flex-col gap-2.5 sm:gap-3">
                {/* Cash Received Input */}
                <div>
                  <div className="flex justify-between items-center text-[11px] sm:text-xs text-[#A1A1AA] mb-1 font-medium">
                    <span>Uang Diterima (Rp)</span>
                    <span className="font-mono text-[10px] sm:text-xs">Fokus / Ketik</span>
                  </div>
                  <input
                    type="number"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className="w-full px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-[12px] bg-[#1C1C1F] border-2 border-transparent focus:border-[#D4FF3F] text-xl sm:text-2xl font-mono font-bold text-white outline-none num tracking-wider"
                  />
                </div>

                {/* Quick Cash Options */}
                <div className="flex flex-wrap gap-1.5">
                  {quickCashOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCashInput(String(opt))}
                      className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-[8px] sm:rounded-[10px] text-[11px] sm:text-xs font-mono font-bold transition-all ${
                        numericCash === opt
                          ? 'bg-[#D4FF3F] text-[#111113]'
                          : 'bg-[#1C1C1F] text-[#F4F4F5] hover:bg-[#2A2A2E] border border-[#2A2A2E]'
                      }`}
                    >
                      {opt === total ? 'Uang Pas' : formatRupiah(opt, false)}
                    </button>
                  ))}
                </div>

                {/* Touch Keypad (3x4) */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-0.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '000'].map(
                    (key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleKeypadPress(key)}
                        className={`py-1.5 sm:py-2.5 rounded-[10px] sm:rounded-[12px] font-mono font-bold text-sm sm:text-base transition-colors ${
                          key === 'C'
                            ? 'bg-[#2A2A2E] text-[#F87171] hover:bg-[#3F3F46]'
                            : 'bg-[#1C1C1F] text-[#F4F4F5] hover:bg-[#2A2A2E] border border-[#2A2A2E]'
                        }`}
                      >
                        {key}
                      </button>
                    )
                  )}
                </div>

                {/* Kembalian Highlight in Lime */}
                <div className="mt-1.5 sm:mt-2.5 p-2.5 sm:p-3 rounded-[14px] bg-[#1C1C1F] border border-[#2A2A2E] flex justify-between items-center">
                  <div>
                    <span className="text-[10px] sm:text-xs text-[#A1A1AA] uppercase tracking-wider font-semibold">
                      Kembalian
                    </span>
                    {!isCashSufficient && (
                      <p className="text-[10px] text-[#F87171] font-medium">
                        Kurang {formatRupiah(total - numericCash)}
                      </p>
                    )}
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-bold text-[#D4FF3F] num">
                    {formatRupiah(changeAmount)}
                  </div>
                </div>
              </div>
            )}

            {/* QRIS MODE */}
            {method === 'qris' && (
              <div className="p-5 rounded-[18px] bg-[#1C1C1F] border border-[#2A2A2E] flex flex-col items-center justify-center text-center gap-3">
                {settings.qris_payload && dynamicQr ? (
                  <>
                    <img src={dynamicQr} alt={`QRIS ${formatRupiah(total)}`} className="w-60 max-w-full rounded-[14px] bg-white p-1.5" />
                    <div className="leading-tight">
                      <p className="font-mono text-xl font-bold text-[#D4FF3F] num">{formatRupiah(total)}</p>
                      <p className="text-xs text-white mt-1">{qrisMerchant}</p>
                      <p className="text-[11px] text-[#A1A1AA] mt-1">
                        Nominal sudah terisi otomatis. Selesaikan transaksi setelah notifikasi dana masuk muncul di DANA Bisnis.
                      </p>
                    </div>
                  </>
                ) : settings.qris_payload && qrError ? (
                  <p className="text-xs text-[#FBBF24] py-6">{qrError}</p>
                ) : settings.qris_payload ? (
                  <p className="text-xs text-[#A1A1AA] py-10">Membuat QRIS…</p>
                ) : settings.qris_image_url ? (
                  <>
                    <img src={settings.qris_image_url} alt="QRIS toko" className="w-56 max-w-full rounded-[14px] bg-white p-2" />
                    <div className="leading-tight">
                      <p className="text-xs text-[#A1A1AA]">Minta pembeli scan & ketik nominal ini, lalu cek notifikasi masuk</p>
                      <p className="font-mono text-lg font-bold text-[#D4FF3F] mt-1 num">{formatRupiah(total)}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-[#FBBF24] py-6">
                    Foto QRIS toko belum diatur. Unggah di menu Pengaturan → Pembayaran agar bisa ditunjukkan ke pembeli.
                  </p>
                )}
              </div>
            )}

            {/* TRANSFER MODE */}
            {method === 'transfer' && (
              <div className="p-5 rounded-[18px] bg-[#1C1C1F] border border-[#2A2A2E] flex flex-col gap-3 text-xs">
                {settings.bank_accounts.length === 0 ? (
                  <p className="text-[#FBBF24] py-4 text-center">
                    Rekening toko belum diatur. Tambahkan di menu Pengaturan → Pembayaran.
                  </p>
                ) : (
                  <>
                    <p className="text-[#A1A1AA]">
                      Transfer <b className="text-[#D4FF3F] font-mono">{formatRupiah(total)}</b> ke rekening toko:
                    </p>
                    {settings.bank_accounts.map((acc, i) => (
                      <div key={i} className="p-3 rounded-[12px] bg-[#111113] border border-[#2A2A2E] flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white">{acc.bank}</span>
                          <p className="font-mono text-sm text-[#D4FF3F] font-bold mt-0.5">{acc.number}</p>
                          <span className="text-[10px] text-[#A1A1AA]">a.n. {acc.holder}</span>
                        </div>
                        <button
                          type="button"
                          title="Salin nomor rekening"
                          onClick={() => navigator.clipboard?.writeText(acc.number.replace(/\D/g, ''))}
                          className="p-2 rounded-lg bg-[#1C1C1F] text-white hover:bg-[#2A2A2E]"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    ))}
                    <p className="text-[#71717A]">Pastikan dana sudah masuk ke rekening sebelum menyelesaikan transaksi.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Selesaikan Transaksi Button in Lime */}
          <button
            type="button"
            disabled={method === 'cash' && !isCashSufficient}
            onClick={handleFinish}
            className={`w-full mt-3 sm:mt-4 py-3 sm:py-4 rounded-[14px] sm:rounded-[16px] font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-lg ${
              method === 'cash' && !isCashSufficient
                ? 'bg-[#2A2A2E] text-[#71717A] cursor-not-allowed'
                : 'bg-[#D4FF3F] text-[#111113] hover:bg-[#c2ed2e] cursor-pointer'
            }`}
          >
            <span>Selesaikan Transaksi</span>
            <kbd className="font-mono text-xs bg-[#111113] text-[#D4FF3F] px-2 py-0.5 rounded-[6px]">
              Enter
            </kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
