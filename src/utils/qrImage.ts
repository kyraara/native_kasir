/** Baca isi QR dari foto & buat gambar QR (library dimuat hanya saat dibutuhkan) */

/** Baca teks QR dari file gambar (foto/screenshot QRIS). null jika tidak ditemukan QR. */
export async function decodeQrFromFile(file: Blob): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  const bitmap = await createImageBitmap(file);
  // Coba beberapa ukuran: QR kecil di foto besar lebih mudah terbaca setelah diperkecil/diperbesar
  for (const target of [1000, 1600, 700]) {
    const scale = Math.min(1, target / Math.max(bitmap.width, bitmap.height)) || 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const res = jsQR(data, w, h, { inversionAttempts: 'attemptBoth' });
    if (res?.data) {
      bitmap.close();
      return res.data;
    }
  }
  bitmap.close();
  return null;
}

/** Gambar QR (SVG data URL) — tajam di layar mana pun */
export async function qrDataUrl(text: string): Promise<string> {
  const QRCode = await import('qrcode');
  const svg = await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
