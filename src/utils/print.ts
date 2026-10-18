/**
 * Cetak lewat iframe tersembunyi dengan dokumen & ukuran kertas sendiri,
 * supaya yang tercetak hanya struk/label (bukan seluruh halaman aplikasi).
 */
export function printHtml(bodyHtml: string, css: string, title = 'Cetak') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`);
  doc.close();

  const run = () => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    // Beri waktu dialog cetak selesai sebelum iframe dibuang
    setTimeout(() => iframe.remove(), 1000);
  };
  // Tunggu gambar (logo/QR/barcode) termuat
  const imgs = Array.from(doc.images);
  if (imgs.every((i) => i.complete)) setTimeout(run, 50);
  else Promise.all(imgs.map((i) => new Promise((r) => ((i.onload = r), (i.onerror = r))))).then(run);
}

export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
