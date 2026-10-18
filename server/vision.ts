/**
 * Kemiripan visual (AI-02, AI-08): embedding gambar dengan model CLIP yang berjalan LOKAL di server
 * (transformers.js + onnxruntime). Gratis, tanpa kuota, tetap jalan walau Gemini tidak tersedia.
 *
 * - Embedding tiap foto produk disimpan di product_photos.embedding (Float32, dinormalisasi).
 * - Pencarian = cosine similarity terhadap semua embedding yang di-cache di memori.
 *   Untuk ribuan foto ini tetap < 50 ms; tidak perlu database vektor.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { getPool, query, exec } from './db';
import { resolveUpload, loadSharp } from './photos';

const MODEL_ID = process.env.VISION_MODEL || 'Xenova/clip-vit-base-patch32';
/** VISION_ENABLED=false → matikan kemiripan foto lokal (hemat RAM di shared hosting); Gemini tetap jalan */
export const VISION_ENABLED = process.env.VISION_ENABLED !== 'false';
const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

type Status = 'idle' | 'loading' | 'ready' | 'error';
let status: Status = 'idle';
let statusError = '';
let loader: Promise<{ processor: any; model: any; RawImage: any }> | null = null;

function loadModel() {
  if (!VISION_ENABLED) return Promise.reject(new Error('kemiripan foto dimatikan (VISION_ENABLED=false)'));
  if (!loader) {
    status = 'loading';
    loader = (async () => {
      const t = await import('@huggingface/transformers');
      t.env.cacheDir = path.resolve(process.cwd(), '.cache/models');
      const processor = await t.AutoProcessor.from_pretrained(MODEL_ID);
      const model = await t.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' });
      status = 'ready';
      return { processor, model, RawImage: t.RawImage };
    })().catch((err) => {
      status = 'error';
      statusError = err?.message || String(err);
      loader = null; // coba lagi di permintaan berikutnya
      throw err;
    });
  }
  return loader;
}

/** Ubah sumber foto (path /uploads/..., data URL, atau Buffer) jadi PNG RGB 224px untuk model */
async function toPngBuffer(src: string | Buffer): Promise<Buffer> {
  let input: Buffer;
  if (Buffer.isBuffer(src)) input = src;
  else if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    const meta = src.slice(0, comma);
    const body = src.slice(comma + 1);
    input = meta.includes(';base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8');
  } else if (src.startsWith('/uploads/')) {
    input = await fs.readFile(resolveUpload(src));
  } else {
    throw new Error('Sumber foto tidak dikenali');
  }
  const sharp = await loadSharp();
  if (!sharp) throw new Error('sharp tidak tersedia di server');
  return sharp(input).flatten({ background: '#ffffff' }).resize(224, 224, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
}

export async function embedImage(src: string | Buffer): Promise<Float32Array> {
  const { processor, model, RawImage } = await loadModel();
  const png = await toPngBuffer(src);
  const image = await RawImage.fromBlob(new Blob([new Uint8Array(png)], { type: 'image/png' }));
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);
  const v = new Float32Array(image_embeds.data as Float32Array);
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

// ---------- Cache embedding & indeks latar belakang ----------

interface Entry {
  photoId: number;
  productId: string;
  vec: Float32Array;
}
let cache: Entry[] | null = null;

async function loadCache(): Promise<Entry[]> {
  if (cache) return cache;
  const rows = await query(
    getPool(),
    `SELECT pp.id, pp.product_id, pp.embedding FROM product_photos pp
     JOIN products p ON p.id = pp.product_id WHERE pp.embedding IS NOT NULL AND p.is_active = 1`
  );
  cache = rows.map((r) => ({
    photoId: r.id,
    productId: r.product_id,
    vec: new Float32Array(new Uint8Array(r.embedding).buffer),
  }));
  return cache;
}

export function invalidateCache() {
  cache = null;
}

let indexing = false;
let indexAgain = false;

/** Buat embedding untuk semua foto yang belum punya. Aman dipanggil berkali-kali (AI-08). */
export function scheduleIndexing() {
  if (!VISION_ENABLED) return;
  if (indexing) {
    indexAgain = true;
    return;
  }
  indexing = true;
  (async () => {
    do {
      indexAgain = false;
      const pending = await query(getPool(), 'SELECT id, url FROM product_photos WHERE embedding IS NULL ORDER BY id LIMIT 500');
      for (const p of pending) {
        try {
          const vec = await embedImage(p.url);
          await exec(getPool(), 'UPDATE product_photos SET embedding = ? WHERE id = ?', [Buffer.from(vec.buffer), p.id]);
        } catch (err: any) {
          if (status === 'error') return; // model tidak bisa dimuat (mis. offline) — coba lagi nanti
          console.warn(`[vision] gagal membuat embedding foto #${p.id}:`, err?.message);
          // tandai dengan vektor kosong supaya tidak diulang terus
          await exec(getPool(), 'UPDATE product_photos SET embedding = ? WHERE id = ?', [Buffer.alloc(0), p.id]);
        }
      }
      if (pending.length) invalidateCache();
      if (pending.length === 500) indexAgain = true;
    } while (indexAgain);
  })()
    .catch((err) => console.warn('[vision] indeks gagal:', err?.message))
    .finally(() => {
      indexing = false;
    });
}

export interface VisualMatch {
  product_id: string;
  score: number; // cosine similarity 0..1
}

/** Produk dengan foto paling mirip (skor terbaik per produk) */
export async function searchSimilar(vec: Float32Array, limit = 10): Promise<VisualMatch[]> {
  const entries = await loadCache();
  const best = new Map<string, number>();
  for (const e of entries) {
    if (e.vec.length !== vec.length) continue;
    let dot = 0;
    for (let i = 0; i < vec.length; i++) dot += vec[i] * e.vec[i];
    if (dot > (best.get(e.productId) ?? -1)) best.set(e.productId, dot);
  }
  return [...best.entries()]
    .map(([product_id, score]) => ({ product_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function visionStatus() {
  const [counts] = await query(
    getPool(),
    `SELECT COUNT(*) AS total, SUM(embedding IS NOT NULL AND LENGTH(embedding) > 0) AS indexed, SUM(embedding IS NULL) AS pending
     FROM product_photos`
  );
  return {
    model: MODEL_ID,
    status: VISION_ENABLED ? status : 'disabled',
    error: status === 'error' ? statusError : undefined,
    photos_total: Number(counts.total || 0),
    photos_indexed: Number(counts.indexed || 0),
    photos_pending: Number(counts.pending || 0),
    indexing,
  };
}

/** Muat model di latar belakang saat server mulai, lalu indeks foto yang belum diproses */
export function warmUp() {
  if (!VISION_ENABLED) return console.log('[vision] kemiripan foto lokal dimatikan (VISION_ENABLED=false)');
  loadModel()
    .then(() => scheduleIndexing())
    .catch((err) => console.warn(`[vision] model ${MODEL_ID} belum bisa dimuat: ${err?.message}. Cari pakai foto tetap jalan lewat Gemini.`));
}
