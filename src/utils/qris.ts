/**
 * QRIS (standar EMVCo Merchant-Presented QR, dipakai semua QRIS Indonesia termasuk DANA).
 * Mengubah QRIS STATIS toko menjadi QRIS dengan NOMINAL terisi otomatis:
 *  - tag 01 (Point of Initiation) 11 → 12
 *  - tambah tag 54 (Transaction Amount) = total belanja
 *  - buang tag tip (55/56/57) supaya pembeli tidak diminta tip
 *  - hitung ulang CRC (tag 63)
 * Dana tetap masuk ke merchant QRIS yang sama; yang berubah hanya nominal terisi otomatis.
 */

export interface TLV {
  tag: string;
  value: string;
}

/** Urai teks QRIS menjadi daftar tag-length-value (tingkat atas) */
export function parseTlv(payload: string): TLV[] {
  const out: TLV[] = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || i + 4 + len > payload.length) {
      throw new Error('Format QRIS tidak valid');
    }
    out.push({ tag, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

export function buildTlv(items: TLV[]): string {
  return items
    .map(({ tag, value }) => {
      if (value.length > 99) throw new Error(`Isi tag ${tag} terlalu panjang`);
      return tag + String(value.length).padStart(2, '0') + value;
    })
    .join('');
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) sesuai spesifikasi QRIS → 4 hex huruf besar */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface QrisInfo {
  merchantName: string;
  city: string;
  /** true jika QR asli sudah berisi nominal tetap */
  hasAmount: boolean;
  isStatic: boolean;
}

/** Cek QRIS valid (format, mata uang Rupiah, negara ID, CRC cocok). Lempar Error dengan pesan jelas jika tidak. */
export function inspectQris(raw: string): QrisInfo {
  const payload = (raw || '').trim();
  if (!payload.startsWith('000201')) throw new Error('Ini bukan kode QRIS (harus diawali 000201)');
  if (payload.length > 512) throw new Error('Kode QRIS terlalu panjang');
  const items = parseTlv(payload);
  const last = items[items.length - 1];
  if (last?.tag !== '63' || last.value.length !== 4) throw new Error('Kode QRIS tidak lengkap (CRC tidak ada)');
  if (crc16(payload.slice(0, -4)).toUpperCase() !== last.value.toUpperCase()) {
    throw new Error('Kode QRIS rusak (CRC tidak cocok). Pastikan foto QR jelas atau salin ulang teksnya.');
  }
  const get = (t: string) => items.find((x) => x.tag === t)?.value;
  if (get('53') !== '360') throw new Error('QRIS bukan untuk Rupiah');
  if (get('58') !== 'ID') throw new Error('QRIS bukan QRIS Indonesia');
  const hasQrisDomain = items.some((x) => Number(x.tag) >= 26 && Number(x.tag) <= 51 && /ID\.CO\.QRIS/i.test(x.value));
  if (!hasQrisDomain) throw new Error('Kode ini bukan QRIS (tidak ada penanda ID.CO.QRIS)');
  return {
    merchantName: get('59') || '',
    city: get('60') || '',
    hasAmount: !!get('54'),
    isStatic: get('01') !== '12',
  };
}

/** QRIS dengan nominal terisi (Rupiah, bilangan bulat) */
export function makeDynamicQris(staticPayload: string, amount: number): string {
  inspectQris(staticPayload);
  const rp = Math.round(amount);
  if (!Number.isFinite(rp) || rp <= 0) throw new Error('Nominal harus lebih dari 0');
  if (String(rp).length > 13) throw new Error('Nominal terlalu besar');

  const items = parseTlv(staticPayload.trim()).filter((x) => !['54', '55', '56', '57', '63'].includes(x.tag));
  const idx01 = items.findIndex((x) => x.tag === '01');
  if (idx01 >= 0) items[idx01] = { tag: '01', value: '12' };
  else items.splice(1, 0, { tag: '01', value: '12' });

  // Sisipkan tag 54 sesuai urutan nomor tag (setelah 53 mata uang)
  const at = items.findIndex((x) => Number(x.tag) > 54);
  items.splice(at < 0 ? items.length : at, 0, { tag: '54', value: String(rp) });

  const body = buildTlv(items) + '6304';
  return body + crc16(body);
}
