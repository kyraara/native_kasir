/** Struk penjualan: cetak thermal 58/80 mm (POS-06) & teks WhatsApp */
import type { Sale, StoreSettings } from '../types';
import { formatRupiah, formatDateTimeIndo } from './pricing';
import { printHtml, escapeHtml as e } from './print';

const METHOD: Record<Sale['payment_method'], string> = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };

function headerLines(s: StoreSettings): string[] {
  const custom = (s.receipt_header || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return custom.length ? custom : [s.name, [s.address, s.city].filter(Boolean).join(', '), s.wa ? `WA ${s.wa}` : ''].filter(Boolean);
}

export function printReceipt(sale: Sale, settings: StoreSettings) {
  const paper = settings.receipt_paper === '80' ? 80 : 58;
  const rp = (n: number) => formatRupiah(n, false);
  const head = headerLines(settings);
  const items = sale.items
    .map(
      (i) => `<div class="item"><div class="name">${e(i.product_name)}</div>
      <div class="row"><span>${i.qty} x ${rp(i.price)}</span><span>${rp(i.qty * i.price)}</span></div>
      ${i.discount > 0 ? `<div class="row muted"><span>Disc</span><span>-${rp(i.discount)}</span></div>` : ''}</div>`
    )
    .join('');

  const body = `<div class="r">
    <div class="c b big">${e(head[0] || '')}</div>
    ${head.slice(1).map((l) => `<div class="c muted">${e(l)}</div>`).join('')}
    <hr>
    <div class="row muted"><span>${e(sale.number)}</span><span>${e(formatDateTimeIndo(sale.created_at))}</span></div>
    ${sale.number.startsWith('OFF-') ? '<div class="c muted">(transaksi offline — nomor resmi menyusul)</div>' : ''}
    ${sale.customer_name ? `<div class="muted">Pelanggan: ${e(sale.customer_name)}</div>` : ''}
    ${sale.vehicle_note ? `<div class="muted">Motor: ${e(sale.vehicle_note)}</div>` : ''}
    <hr>${items}<hr>
    ${sale.discount > 0 ? `<div class="row"><span>Diskon</span><span>-${rp(sale.discount)}</span></div>` : ''}
    <div class="row b big"><span>TOTAL</span><span>${rp(sale.total)}</span></div>
    ${
      sale.payment_method === 'cash'
        ? `<div class="row"><span>Tunai</span><span>${rp(sale.cash_received || sale.total)}</span></div>
           <div class="row b"><span>Kembali</span><span>${rp(sale.change_amount || 0)}</span></div>`
        : `<div class="row"><span>Bayar</span><span>${METHOD[sale.payment_method]}</span></div>`
    }
    ${sale.status === 'void' ? '<div class="c b big">*** DIBATALKAN ***</div>' : ''}
    <hr>
    <div class="c muted pre">${e(settings.receipt_footer || '')}</div>
  </div>`;

  const css = `
    @page { size: ${paper}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; width: ${paper}mm; font-family: 'Courier New', ui-monospace, monospace; color: #000; }
    .r { padding: 2mm ${paper === 80 ? 4 : 2}mm 6mm; font-size: ${paper === 80 ? 12 : 10.5}px; line-height: 1.3; }
    .c { text-align: center; } .b { font-weight: 700; } .big { font-size: 1.15em; } .muted { color: #222; }
    .pre { white-space: pre-line; }
    .row { display: flex; justify-content: space-between; gap: 4px; }
    .item { margin: 1.5mm 0; } .name { font-weight: 700; }
    hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }`;
  printHtml(body, css, sale.number);
}

export function receiptText(sale: Sale, settings: StoreSettings): string {
  const rp = (n: number) => formatRupiah(n, false);
  return [
    `*${settings.name.toUpperCase()}*`,
    ...headerLines(settings).slice(1),
    '--------------------------------',
    `No: ${sale.number}`,
    formatDateTimeIndo(sale.created_at),
    ...(sale.customer_name ? [`Pelanggan: ${sale.customer_name}`] : []),
    ...(sale.vehicle_note ? [`Motor: ${sale.vehicle_note}`] : []),
    '--------------------------------',
    ...sale.items.map(
      (i) => `${i.product_name}\n  ${i.qty} x ${rp(i.price)} = ${rp(i.qty * i.price - i.discount)}${i.discount > 0 ? ` (disc ${rp(i.discount)})` : ''}`
    ),
    '--------------------------------',
    ...(sale.discount > 0 ? [`Diskon: -${formatRupiah(sale.discount)}`] : []),
    `*TOTAL: ${formatRupiah(sale.total)}*`,
    sale.payment_method === 'cash'
      ? `Tunai: ${formatRupiah(sale.cash_received || sale.total)}\nKembali: ${formatRupiah(sale.change_amount || 0)}`
      : `Bayar: ${METHOD[sale.payment_method]}`,
    '--------------------------------',
    settings.receipt_footer,
  ].join('\n');
}

/** "0812-3456-7890" / "+62 812…" → "6281234567890"; null jika tidak valid */
export function normalizeWaNumber(input: string): string | null {
  let d = (input || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,13}$/.test(d) ? d : null;
}

export function whatsappUrl(text: string, phone?: string | null): string {
  const t = encodeURIComponent(text);
  return phone ? `https://wa.me/${phone}?text=${t}` : `https://api.whatsapp.com/send?text=${t}`;
}
