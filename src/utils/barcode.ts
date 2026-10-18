/**
 * Barcode Code 128 (set B, semua karakter ASCII 32–126) → SVG.
 * Bisa dibaca semua scanner barcode kasir; dipakai untuk label rak/produk (PRD-07).
 */

// Lebar bar/spasi bergantian untuk nilai 0..106 (106 = STOP)
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

export function isEncodable(text: string): boolean {
  return text.length > 0 && /^[\x20-\x7e]+$/.test(text);
}

/** Nilai simbol (start, data, checksum, stop) */
export function code128Values(text: string): number[] {
  if (!isEncodable(text)) throw new Error('Barcode hanya boleh huruf, angka, dan simbol standar');
  const data = [...text].map((c) => c.charCodeAt(0) - 32);
  const checksum = (START_B + data.reduce((sum, v, i) => sum + v * (i + 1), 0)) % 103;
  return [START_B, ...data, checksum, STOP];
}

/** Lebar modul bergantian bar-spasi-bar..., diawali bar */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((v) => [...PATTERNS[v]].map(Number));
}

/** SVG barcode; lebar mengikuti jumlah modul (quiet zone 10 modul kiri-kanan) */
export function code128Svg(text: string, opts: { height?: number; moduleWidth?: number } = {}): string {
  const h = opts.height ?? 40;
  const m = opts.moduleWidth ?? 1;
  const quiet = 10;
  let x = quiet;
  const rects: string[] = [];
  code128Widths(text).forEach((w, i) => {
    if (i % 2 === 0) rects.push(`<rect x="${x * m}" y="0" width="${w * m}" height="${h}"/>`);
    x += w;
  });
  const total = (x + quiet) * m;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join('')}</g></svg>`;
}

/**
 * Barcode internal toko: EAN-13 berawalan "20" (rentang khusus pemakaian internal toko,
 * tidak bentrok dengan barcode pabrik). 10 digit acak + digit cek.
 */
export function generateInternalBarcode(existing: Set<string> = new Set()): string {
  for (;;) {
    let digits = '20';
    for (let i = 0; i < 10; i++) digits += Math.floor(Math.random() * 10);
    const sum = [...digits].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
    const code = digits + ((10 - (sum % 10)) % 10);
    if (!existing.has(code)) return code;
  }
}
