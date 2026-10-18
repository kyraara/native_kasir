import React, { useState } from 'react';
import { Printer, Share2, X, CheckCircle, ArrowRight } from 'lucide-react';
import { Sale, StoreSettings } from '../../types';
import { formatRupiah, formatDateTimeIndo } from '../../utils/pricing';
import { printReceipt, receiptText, normalizeWaNumber, whatsappUrl } from '../../utils/receipt';

interface ThermalReceiptModalProps {
  sale: Sale;
  settings: StoreSettings;
  onClose: () => void;
  /** Tidak diisi = mode cetak ulang (dari riwayat penjualan) */
  onNewSale?: () => void;
}

export function ThermalReceiptModal({
  sale,
  settings,
  onClose,
  onNewSale,
}: ThermalReceiptModalProps) {
  const [phone, setPhone] = useState('');
  const waNumber = normalizeWaNumber(phone);

  const handlePrint = () => printReceipt(sale, settings);

  const handleShareWhatsApp = () => {
    if (phone && !waNumber) return alert('Nomor WhatsApp tidak valid. Contoh: 0812-3456-7890');
    window.open(whatsappUrl(receiptText(sale, settings), waNumber), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-[22px] w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Actions */}
        <div className="p-4 border-b border-[#E4E4E7] flex items-center justify-between bg-[#F9FAFB]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#16A34A]">
            <CheckCircle size={16} />
            <span>{onNewSale ? 'Transaksi Berhasil Disimpan' : `Cetak Ulang ${sale.number}`}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[#E4E4E7] text-[#71717A]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Realistic 58mm Thermal Receipt Simulation */}
        <div className="p-6 overflow-y-auto max-h-[60vh] bg-[#F4F4F5] flex justify-center">
          <div
            id="thermal-receipt-print"
            className="w-[280px] bg-white p-5 rounded-[8px] shadow-sm font-mono text-[11px] leading-tight text-[#111113] border border-[#E4E4E7]"
          >
            {/* Header */}
            <div className="text-center mb-3">
              <h4 className="font-bold text-sm tracking-wider uppercase">
                {settings.name}
              </h4>
              <p className="text-[10px] text-[#5B5B63]">
                Sparepart Motor · {settings.city}
              </p>
              <p className="text-[10px] text-[#5B5B63]">WA {settings.wa}</p>
            </div>

            <div className="border-t border-dashed border-[#A1A1AA] my-2" />

            {/* Meta */}
            <div className="flex justify-between text-[10px] text-[#5B5B63]">
              <span>{sale.number}</span>
              <span>{formatDateTimeIndo(sale.created_at)}</span>
            </div>
            {sale.customer_name && (
              <div className="text-[10px] text-[#5B5B63] mt-0.5">
                Cust: {sale.customer_name}
              </div>
            )}
            {sale.vehicle_note && (
              <div className="text-[10px] text-[#5B5B63]">
                Unit: {sale.vehicle_note}
              </div>
            )}

            <div className="border-t border-dashed border-[#A1A1AA] my-2" />

            {/* Items */}
            <div className="flex flex-col gap-2 my-2">
              {sale.items.map((item, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="font-semibold text-xs leading-none">
                    {item.product_name}
                  </span>
                  <div className="flex justify-between items-center text-[11px] text-[#5B5B63] mt-0.5">
                    <span>
                      {item.qty} x {formatRupiah(item.price, false)}
                    </span>
                    <span className="font-bold text-[#111113]">
                      {formatRupiah(item.qty * item.price, false)}
                    </span>
                  </div>
                  {item.discount > 0 && (
                    <div className="flex justify-between text-[10px] text-[#DC2626]">
                      <span>Disc</span>
                      <span>-{formatRupiah(item.discount, false)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-[#A1A1AA] my-2" />

            {/* Subtotal & Total */}
            <div className="flex flex-col gap-1 text-[11px]">
              {sale.discount > 0 && (
                <div className="flex justify-between text-[#DC2626]">
                  <span>Diskon</span>
                  <span>-{formatRupiah(sale.discount, false)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-[#E4E4E7]">
                <span>TOTAL</span>
                <span className="text-sm">{formatRupiah(sale.total, false)}</span>
              </div>

              {sale.payment_method === 'cash' ? (
                <>
                  <div className="flex justify-between text-[#5B5B63] pt-1">
                    <span>Tunai</span>
                    <span>{formatRupiah(sale.cash_received || sale.total, false)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[#111113]">
                    <span>Kembali</span>
                    <span>{formatRupiah(sale.change_amount || 0, false)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-[#5B5B63] pt-1">
                  <span>Pembayaran</span>
                  <span className="uppercase font-bold">{sale.payment_method}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-[#A1A1AA] my-3" />

            {/* Footer */}
            <div className="text-center text-[10px] text-[#6E6E76] whitespace-pre-line leading-snug">
              {settings.receipt_footer}
            </div>
          </div>
        </div>

        {/* Kirim struk ke WhatsApp pembeli */}
        <div className="px-4 pt-3 bg-white flex items-center gap-2 text-xs">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="No. WA pembeli (opsional), mis. 0812…"
            className={`flex-1 px-3 py-2 rounded-[10px] bg-[#F4F4F5] font-mono outline-none ${phone && !waNumber ? 'ring-1 ring-[#DC2626]' : ''}`}
          />
        </div>

        {/* Modal Bottom Buttons */}
        <div className="p-4 border-t border-[#E4E4E7] flex items-center justify-between gap-2 bg-white">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-[12px] bg-[#111113] text-white hover:bg-[#27272A] text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
            >
              <Printer size={15} />
              <span>Cetak ({settings.receipt_paper === '80' ? '80' : '58'} mm)</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="px-3.5 py-2.5 rounded-[12px] bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#111113] text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Share2 size={15} />
              <span>{waNumber ? 'Kirim ke WA Pembeli' : 'Kirim Struk WA'}</span>
            </button>
          </div>

          {onNewSale && (
            <button
              onClick={onNewSale}
              className="px-4 py-2.5 rounded-[12px] bg-[#D4FF3F] text-[#111113] hover:bg-[#c2ed2e] text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <span>Transaksi Baru</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
