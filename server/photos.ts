/**
 * Penyimpanan foto di disk (folder uploads/). Semua foto di-encode ulang ke WebP
 * (sisi terpanjang maks. 1600 px, metadata/EXIF termasuk lokasi GPS dibuang).
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { HttpError } from './db';

/** sharp dimuat saat dibutuhkan; jika tidak tersedia di hosting, foto disimpan apa adanya (sudah dikompres browser) */
let sharpMod: any | null | undefined;
export async function loadSharp(): Promise<any | null> {
  if (sharpMod === undefined) {
    try {
      sharpMod = (await import('sharp')).default;
    } catch (err: any) {
      console.warn('[foto] sharp tidak tersedia, foto disimpan tanpa diproses ulang:', err?.message);
      sharpMod = null;
    }
  }
  return sharpMod;
}

/** Kenali jenis gambar dari isi file (bukan dari nama/klaim pengirim) */
function sniffImage(buf: Buffer): 'webp' | 'jpg' | 'png' | null {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  return null;
}

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^data:image\/(jpeg|png|webp|gif|heic|heif|avif);base64,/i;

export function decodeDataUrl(dataUrl: string): Buffer {
  if (typeof dataUrl !== 'string' || !ALLOWED.test(dataUrl)) {
    throw new HttpError(400, 'File harus berupa gambar (JPG, PNG, WebP)');
  }
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'Ukuran foto maksimal 8 MB');
  return buf;
}

/** Simpan gambar ke uploads/<folder>/<yyyymm>/<uuid>.webp → URL publik /uploads/... */
export async function saveImage(input: Buffer, folder: 'products' | 'search', maxSide = 1600): Promise<string> {
  let out: Buffer;
  let ext = 'webp';
  const sharp = await loadSharp();
  if (sharp) {
    try {
      out = await sharp(input, { failOn: 'error' })
        .rotate() // ikuti orientasi kamera HP, lalu metadata dibuang
        .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new HttpError(400, 'Gambar tidak bisa dibaca / rusak');
    }
  } else {
    const kind = sniffImage(input);
    if (!kind) throw new HttpError(400, 'File harus berupa gambar JPG, PNG, atau WebP');
    out = input;
    ext = kind;
  }
  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const rel = path.posix.join(folder, month, `${randomUUID()}.${ext}`);
  const abs = path.join(UPLOAD_ROOT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, out);
  return `/uploads/${rel}`;
}

export async function copyToProducts(url: string): Promise<string> {
  const buf = await fs.readFile(resolveUpload(url));
  return saveImage(buf, 'products');
}

export function resolveUpload(url: string): string {
  if (!url.startsWith('/uploads/')) throw new Error('Bukan file upload');
  const abs = path.resolve(UPLOAD_ROOT, url.slice('/uploads/'.length));
  if (!abs.startsWith(UPLOAD_ROOT + path.sep)) throw new Error('Path tidak valid');
  return abs;
}

export async function deleteUpload(url: string | null | undefined) {
  if (!url?.startsWith('/uploads/')) return;
  await fs.rm(resolveUpload(url), { force: true }).catch(() => {});
}
