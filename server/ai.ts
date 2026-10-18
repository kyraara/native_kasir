/**
 * Cari pakai foto (AI-01..AI-09): dua jalur berjalan bersamaan
 *  1. Kemiripan visual (CLIP lokal, lihat vision.ts)
 *  2. Pembacaan Gemini: jenis part, ciri, part number tercetak, perkiraan motor
 * Penggabungan & keputusan akhir ada di kasir (pemilik yang memilih).
 */
import { GoogleGenAI } from '@google/genai';
import { getPool, query, exec, newId, HttpError } from './db';
import { getSettings } from './repo';
import { storeToday } from './reports';
import fs from 'node:fs/promises';
import { decodeDataUrl, saveImage, copyToProducts, deleteUpload, resolveUpload } from './photos';
import * as vision from './vision';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const LOG_RETENTION_DAYS = 30;

const apiKey = () => {
  const k = process.env.GEMINI_API_KEY;
  return k && k !== 'MY_GEMINI_API_KEY' ? k : null;
};

const PROMPT = `Anda adalah teknisi & ahli katalog sparepart motor berpengalaman di Indonesia.
Analisis foto sparepart motor yang dikirimkan dan identifikasi:
1. Jenis part / nama teknis yang lazim dipakai toko (mis. "Kampas Rem Cakram Depan", "Busi", "V-Belt CVT", "Roller CVT", "Aki Kering MF", "Filter Udara", "Bearing Roda").
2. Ciri fisik spesifik (bentuk, jumlah lubang/pin, ukuran, warna, cakram/tromol, dll).
3. Teks atau nomor part (part number) yang tercetak pada barang/kemasan, persis seperti tertulis. Jika tidak terbaca, null.
4. Merek part jika terlihat. Jika tidak, null.
5. Perkiraan model motor yang cocok di Indonesia (maks. 4).
6. 3 kata kunci pencarian toko dalam bahasa Indonesia sehari-hari (mis. "kampas rem", "busi", "vanbelt").
Jika foto bukan sparepart motor, isi part_type dengan "Bukan sparepart" dan kosongkan sisanya.

KEMBALIKAN HANYA JSON VALID:
{"part_type":"string","features":["string"],"part_number_ocr":"string|null","brand":"string|null","estimated_motor":["string"],"suggested_keywords":["string"],"raw_description":"1 kalimat"}`;

// ---------- Kuota harian (AI-09) ----------

async function usageToday(): Promise<number> {
  const [row] = await query(getPool(), 'SELECT calls FROM ai_usage WHERE usage_date = ?', [storeToday()]);
  return Number(row?.calls || 0);
}

async function reserveCall(limit: number): Promise<boolean> {
  // Tambah 1 hanya jika masih di bawah batas; hari baru → baris baru
  const upd = await exec(getPool(), 'UPDATE ai_usage SET calls = calls + 1 WHERE usage_date = ? AND calls < ?', [storeToday(), limit]);
  if (upd.affectedRows > 0) return true;
  if (limit <= 0) return false;
  const ins = await exec(getPool(), 'INSERT IGNORE INTO ai_usage (usage_date, calls) VALUES (?, 1)', [storeToday()]);
  return ins.affectedRows > 0;
}

export async function aiStatus() {
  const settings = await getSettings(getPool());
  const v = await vision.visionStatus();
  // Foto yang masuk dari luar aplikasi (mis. db:seed / restore) ikut diindeks
  if (v.photos_pending > 0 && !v.indexing && v.status !== 'loading' && v.status !== 'disabled') vision.scheduleIndexing();
  return {
    gemini: { has_key: !!apiKey(), model: GEMINI_MODEL, used_today: await usageToday(), daily_quota: settings.ai_daily_quota },
    vision: v,
  };
}

// ---------- Pembacaan Gemini ----------

export interface AIReading {
  part_type: string;
  features: string[];
  part_number_ocr: string | null;
  brand?: string | null;
  estimated_motor: string[];
  suggested_keywords: string[];
  raw_description?: string;
}

async function readWithGemini(image: Buffer): Promise<{ reading: AIReading | null; error?: string }> {
  const key = apiKey();
  if (!key) return { reading: null, error: 'API key Gemini belum diisi (GEMINI_API_KEY di .env)' };
  const settings = await getSettings(getPool());
  if (!(await reserveCall(settings.ai_daily_quota || 100))) {
    return { reading: null, error: `Kuota AI harian (${settings.ai_daily_quota}) sudah habis. Hasil di bawah dari kemiripan foto saja.` };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/webp', data: image.toString('base64') } }] }],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    const parsed = JSON.parse(response.text?.trim() || '{}');
    return {
      reading: {
        part_type: String(parsed.part_type || ''),
        features: Array.isArray(parsed.features) ? parsed.features.map(String) : [],
        part_number_ocr: parsed.part_number_ocr ? String(parsed.part_number_ocr) : null,
        brand: parsed.brand ? String(parsed.brand) : null,
        estimated_motor: Array.isArray(parsed.estimated_motor) ? parsed.estimated_motor.map(String).slice(0, 4) : [],
        suggested_keywords: Array.isArray(parsed.suggested_keywords) ? parsed.suggested_keywords.map(String).slice(0, 5) : [],
        raw_description: parsed.raw_description ? String(parsed.raw_description) : undefined,
      },
    };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return { reading: null, error: 'AI sedang penuh (batas Gemini), coba lagi sebentar lagi.' };
    if (/API key|PERMISSION_DENIED|401|403/i.test(msg)) return { reading: null, error: 'API key Gemini ditolak. Periksa GEMINI_API_KEY.' };
    console.warn('[ai] Gemini gagal:', msg);
    return { reading: null, error: 'AI tidak bisa membaca foto saat ini.' };
  }
}

// ---------- Pencarian ----------

/**
 * Tahap 1 (cepat, < 1 dtk): simpan foto & cari kemiripan visual.
 * Tahap 2 (readPhoto): pembacaan Gemini, dipanggil terpisah supaya kandidat visual tampil duluan.
 */
export async function photoSearch(imageDataUrl: string) {
  const raw = decodeDataUrl(imageDataUrl);
  // Simpan versi kecil untuk log & referensi (dihapus otomatis setelah 30 hari)
  const photoPath = await saveImage(raw, 'search', 1024);
  const webp = await fs.readFile(resolveUpload(photoPath));
  vision.scheduleIndexing(); // pastikan foto produk yang baru masuk ikut terindeks

  const visual = await vision
    .embedImage(webp)
    .then((vec) => vision.searchSimilar(vec, 10))
    .then((matches) => ({ matches, error: undefined as string | undefined }))
    .catch((err) => ({ matches: null, error: `Pencarian kemiripan foto belum siap: ${err?.message || err}` }));

  const id = newId('psl');
  await exec(getPool(), 'INSERT INTO photo_search_logs (id, photo_path, ai_source, candidates) VALUES (?,?,?,?)', [
    id,
    photoPath,
    'pending',
    visual.matches ? JSON.stringify(visual.matches.slice(0, 5)) : null,
  ]);

  return { log_id: id, photo_url: photoPath, visual: visual.matches, visual_error: visual.error };
}

export async function readPhoto(logId: string) {
  const [log] = await query(getPool(), 'SELECT photo_path, ai_reading, ai_source FROM photo_search_logs WHERE id = ?', [logId]);
  if (!log?.photo_path) throw new HttpError(404, 'Foto pencarian tidak ditemukan');
  if (log.ai_reading) {
    return { reading: typeof log.ai_reading === 'string' ? JSON.parse(log.ai_reading) : log.ai_reading, reading_error: undefined };
  }
  const webp = await fs.readFile(resolveUpload(log.photo_path));
  const gemini = await readWithGemini(webp);
  await exec(getPool(), 'UPDATE photo_search_logs SET ai_reading = ?, ai_source = ? WHERE id = ?', [
    gemini.reading ? JSON.stringify(gemini.reading) : null,
    gemini.reading ? GEMINI_MODEL : 'none',
    logId,
  ]);
  return { reading: gemini.reading, reading_error: gemini.error };
}

/** "Ini barangnya" (AI-06, AI-07): catat pilihan & simpan foto sebagai referensi produk */
export async function choose(logId: string, productId: string, saveReference: boolean) {
  const [log] = await query(getPool(), 'SELECT * FROM photo_search_logs WHERE id = ?', [logId]);
  if (!log) throw new HttpError(404, 'Data pencarian tidak ditemukan');
  const [product] = await query(getPool(), 'SELECT id FROM products WHERE id = ?', [productId]);
  if (!product) throw new HttpError(404, 'Produk tidak ditemukan');

  const settings = await getSettings(getPool());
  let saved = false;
  if (saveReference && settings.ai_save_reference !== false && log.photo_path) {
    const url = await copyToProducts(log.photo_path);
    await exec(getPool(), "INSERT INTO product_photos (product_id, sort_order, url, source) VALUES (?, 99, ?, 'reference')", [productId, url]);
    vision.scheduleIndexing();
    saved = true;
  }
  await exec(
    getPool(),
    'UPDATE photo_search_logs SET chosen_product_id = ?, saved_as_reference = ?, chosen_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
    [productId, saved ? 1 : 0, logId]
  );
  return { saved_as_reference: saved };
}

/** Hapus foto pelanggan yang lebih dari 30 hari (privasi) */
export async function purgeOldSearchPhotos() {
  const limit = new Date(Date.now() - LOG_RETENTION_DAYS * 86400000);
  const rows = await query(getPool(), 'SELECT id, photo_path FROM photo_search_logs WHERE photo_path IS NOT NULL AND created_at < ?', [limit]);
  for (const r of rows) {
    await deleteUpload(r.photo_path);
    await exec(getPool(), 'UPDATE photo_search_logs SET photo_path = NULL WHERE id = ?', [r.id]);
  }
  if (rows.length) console.log(`[ai] ${rows.length} foto pencarian lama dihapus`);
}

/** Ringkasan akurasi (AI-07): seberapa sering produk yang dipilih ada di kandidat visual */
export async function accuracyStats() {
  const rows = await query(
    getPool(),
    'SELECT candidates, chosen_product_id FROM photo_search_logs WHERE created_at >= ? ',
    [new Date(Date.now() - 30 * 86400000)]
  );
  const searches = rows.length;
  const chosen = rows.filter((r) => r.chosen_product_id);
  const visualHit = chosen.filter((r) => {
    const c = typeof r.candidates === 'string' ? JSON.parse(r.candidates) : r.candidates;
    return Array.isArray(c) && c.some((m: any) => m.product_id === r.chosen_product_id);
  }).length;
  return { searches_30d: searches, chosen_30d: chosen.length, visual_top5_hits: visualHit };
}
