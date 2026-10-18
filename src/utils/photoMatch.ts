/**
 * Gabungkan hasil dua jalur cari-pakai-foto menjadi maks. 5 kandidat (AI-04):
 *  - kemiripan visual (skor cosine CLIP dari server)
 *  - pembacaan AI → part number & kata kunci → pencarian teks biasa (search.ts)
 * Kandidat yang muncul di kedua jalur mendapat bonus.
 */
import type { Product, AICandidateMatch } from '../types';
import type { AIReading } from './api';
import { searchProducts, findByExactCode, motorFamily, normalize } from './search';

interface Acc {
  product: Product;
  visual: number;
  text: number;
  reasons: string[];
}

/** Cosine CLIP: ~0.6 = beda barang, ~0.85+ = barang/foto sangat mirip */
const visualToScore = (cos: number) => Math.max(0, Math.min(1, (cos - 0.6) / 0.3));

export function defaultQuery(reading: AIReading | null): string {
  if (!reading) return '';
  return reading.part_number_ocr || reading.suggested_keywords[0] || reading.part_type || '';
}

export function mergeCandidates(
  products: Product[],
  visual: Array<{ product_id: string; score: number }> | null,
  reading: AIReading | null,
  query: string,
  limit = 5
): AICandidateMatch[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const acc = new Map<string, Acc>();
  const get = (p: Product) => {
    if (!acc.has(p.id)) acc.set(p.id, { product: p, visual: 0, text: 0, reasons: [] });
    return acc.get(p.id)!;
  };

  for (const m of visual || []) {
    const p = byId.get(m.product_id);
    if (!p) continue;
    const s = visualToScore(m.score);
    if (s <= 0) continue;
    const a = get(p);
    a.visual = s;
    a.reasons.push(`Foto mirip ${Math.round(m.score * 100)}%`);
  }

  const ocr = reading?.part_number_ocr?.trim();
  if (ocr) {
    const exact = findByExactCode(products, ocr);
    if (exact) {
      const a = get(exact);
      a.text = 1;
      a.reasons.push(`Part number "${ocr}" terbaca & cocok`);
    }
  }

  const q = query.trim();
  if (q) {
    searchProducts(products, q)
      .slice(0, 8)
      .forEach((p, idx) => {
        const a = get(p);
        const s = Math.max(0.25, 0.7 - idx * 0.07);
        if (s > a.text) a.text = s;
        if (!a.reasons.some((r) => r.startsWith('Part number'))) a.reasons.push(`Cocok kata kunci "${q}"`);
      });
  }

  // Bonus kecil jika motor perkiraan AI ada di kompatibilitas produk
  const motorWords = (reading?.estimated_motor || []).map((m) => normalize(m).split(' '));
  const results = [...acc.values()].map((a) => {
    let score = Math.max(a.visual, a.text);
    if (a.visual > 0 && a.text > 0) score += 0.15;
    const fit = a.product.fitments.find((f) =>
      motorWords.some((words) => words.includes(normalize(motorFamily(f.model))))
    );
    if (fit && score > 0) {
      score += 0.05;
      a.reasons.push(`Cocok untuk ${fit.brand} ${fit.model}`);
    }
    score = Math.min(1, score);
    const match_level: AICandidateMatch['match_level'] = score >= 0.8 ? 'Sangat mirip' : score >= 0.5 ? 'Mirip' : 'Mungkin';
    return { product: a.product, match_level, confidence_score: Math.round(score * 100), reason: a.reasons.join(' · ') };
  });

  return results
    .filter((r) => r.confidence_score >= 20)
    .sort((a, b) => b.confidence_score - a.confidence_score || b.product.stock_qty - a.product.stock_qty)
    .slice(0, limit);
}
