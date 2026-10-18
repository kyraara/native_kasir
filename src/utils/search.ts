/**
 * Pencarian produk yang toleran salah ketik & sinonim (dipakai katalog & kasir).
 * Berjalan di browser supaya cepat dan tetap bisa dipakai saat offline (Fase 6).
 *
 * Contoh yang ditemukan:
 *  - "kampas beat 2018"  → kampas rem yang cocok untuk Beat tahun 2018
 *  - "06455k44"          → part number 06455-K44-V01
 *  - "accu nmax"         → aki (sinonim) untuk NMAX
 *  - "vanbelt vario"     → V-Belt (sinonim), "kmpas" → kampas (salah ketik)
 */
import type { Product, MotorFitment } from '../types';

// Kata pertama di tiap grup adalah bentuk baku.
const SYNONYMS: string[][] = [
  ['kampas', 'brake pad', 'brakepad', 'pad', 'kanvas'],
  ['aki', 'accu', 'baterai', 'battery', 'batere'],
  ['busi', 'spark plug', 'sparkplug', 'plug'],
  ['vbelt', 'v belt', 'vanbelt', 'van belt', 'fanbelt', 'fan belt', 'belt'],
  ['oli', 'oil', 'pelumas', 'olie'],
  ['bearing', 'laher', 'lahar', 'klaher'],
  ['roller', 'roler', 'rolle'],
  ['filter', 'saringan', 'filtr'],
  ['rantai', 'chain'],
  ['gir', 'gear', 'sproket', 'sprocket'],
  ['shock', 'shockbreaker', 'shock breaker', 'sokbreker', 'shok', 'skok'],
  ['ban', 'tire', 'tyre'],
  ['lampu', 'bohlam', 'lamp', 'bulb'],
  ['kabel', 'cable', 'kable'],
  
  ['karburator', 'karbu', 'carburetor'],
  ['injektor', 'injector', 'injeksi'],
  ['kopling', 'clutch'],
];

const PHRASE_TO_CANON: Array<[RegExp, string]> = SYNONYMS.flatMap((group) =>
  group.slice(1).map((alt) => [new RegExp(`\\b${alt.replace(/\s+/g, '\\s+')}\\b`, 'g'), group[0]] as [RegExp, string])
).sort((a, b) => b[0].source.length - a[0].source.length); // frasa terpanjang dulu

export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function canonicalize(s: string): string {
  let out = ` ${normalize(s)} `;
  for (const [re, canon] of PHRASE_TO_CANON) out = out.replace(re, canon);
  return out.trim().replace(/\s+/g, ' ');
}

/** "06455-K44-V01" → "06455k44v01" */
export function compact(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function maxTypos(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

interface IndexedProduct {
  product: Product;
  nameWords: Set<string>;
  words: string[]; // semua kata (nama, merek, kategori, motor, rak)
  codes: string[]; // sku, part number, barcode dalam bentuk compact
}

const indexCache = new WeakMap<Product, IndexedProduct>();

function indexProduct(p: Product): IndexedProduct {
  let idx = indexCache.get(p);
  if (idx) return idx;
  const name = canonicalize(p.name).split(' ');
  const rest = canonicalize(
    [p.brand, p.category, p.rack_location, p.part_number, p.sku, ...p.fitments.map((f) => `${f.brand} ${f.model}`)].join(' ')
  ).split(' ');
  idx = {
    product: p,
    nameWords: new Set(name),
    words: [...new Set([...name, ...rest])].filter(Boolean),
    codes: [p.sku, p.part_number, p.barcode].map(compact).filter(Boolean),
  };
  indexCache.set(p, idx);
  return idx;
}

/** Skor satu kata kunci terhadap produk; 0 = tidak cocok. */
function scoreToken(token: string, idx: IndexedProduct): number {
  let best = 0;
  for (const w of idx.words) {
    if (w === token) return idx.nameWords.has(w) ? 10 : 8;
    if (w.startsWith(token)) best = Math.max(best, idx.nameWords.has(w) ? 7 : 5);
    else if (token.length >= 3 && w.includes(token)) best = Math.max(best, 3);
  }
  if (token.length >= 3) {
    for (const c of idx.codes) {
      if (c === token) return 12;
      if (c.startsWith(token)) best = Math.max(best, 9);
      else if (token.length >= 4 && c.includes(token)) best = Math.max(best, 6);
    }
  }
  if (best > 0) return best;

  const max = maxTypos(token.length);
  if (max === 0) return 0;
  for (const w of idx.words) {
    // bandingkan juga dengan awalan kata, supaya "kmpas" cocok dgn "kampas" & "vari" dgn "vario"
    const cand = w.length > token.length + max ? w.slice(0, token.length + 1) : w;
    if (editDistance(token, cand, max) <= max) best = Math.max(best, 2);
  }
  return best;
}

export function fitmentCoversYear(f: MotorFitment, year: number): boolean {
  return year >= f.year_from && year <= f.year_to;
}

/** Filter motor per keluarga model: brand + kata pertama model ("Beat FI / eSP" → Beat). */
export interface MotorFilter {
  brand: string;
  family: string;
}

export function motorFamily(model: string): string {
  return (model || '').trim().split(/[\s/]+/)[0] || model;
}

function fitmentMatchesMotor(f: MotorFitment, m: MotorFilter): boolean {
  return f.brand.toLowerCase() === m.brand.toLowerCase() && motorFamily(f.model).toLowerCase() === m.family.toLowerCase();
}

export interface SearchOptions {
  motor?: MotorFilter | null;
  year?: number | null;
}

const YEAR_RE = /^(19[89]\d|20[0-4]\d)$/;

/**
 * Cari & urutkan produk. Query kosong → semua produk (urutan asli).
 * Tahun di dalam query (mis. "2018") dipakai sebagai filter tahun motor.
 */
export function searchProducts(products: Product[], query: string, opts: SearchOptions = {}): Product[] {
  const tokens = canonicalize(query).split(' ').filter(Boolean);
  let year = opts.year ?? null;
  const words: string[] = [];
  for (const t of tokens) {
    if (YEAR_RE.test(t)) year = Number(t);
    else words.push(t);
  }
  // Query berupa kode utuh (barcode/part number dengan strip) → cocokkan juga versi compact-nya
  const wholeCode = compact(query);

  const scored: Array<{ p: Product; score: number }> = [];
  for (const p of products) {
    if (opts.motor || year) {
      const fits = p.fitments.filter(
        (f) =>
          (!opts.motor || fitmentMatchesMotor(f, opts.motor)) &&
          (!year || fitmentCoversYear(f, year))
      );
      if (!fits.length) continue;
    }
    if (!words.length) {
      scored.push({ p, score: 0 });
      continue;
    }

    const idx = indexProduct(p);
    let total = 0;
    if (wholeCode.length >= 4 && idx.codes.includes(wholeCode)) {
      total = 100;
    } else {
      for (const t of words) {
        const s = scoreToken(t, idx);
        if (s === 0) {
          total = 0;
          break;
        }
        total += s;
      }
    }
    if (total > 0) scored.push({ p, score: total });
  }

  if (!words.length) return scored.map((s) => s.p);
  return scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).map((s) => s.p);
}

/** Produk yang kodenya persis sama dengan hasil scan (barcode / SKU / part number). */
export function findByExactCode(products: Product[], code: string): Product | undefined {
  const c = compact(code);
  if (c.length < 3) return undefined;
  return (
    products.find((p) => compact(p.barcode) === c) ||
    products.find((p) => compact(p.sku) === c) ||
    products.find((p) => compact(p.part_number) === c)
  );
}

export interface MotorOption extends MotorFilter {
  label: string;
  count: number;
}

/** Daftar keluarga motor dari data kompatibilitas, urut dari yang paling banyak part-nya. */
export function listMotors(products: Product[]): MotorOption[] {
  const map = new Map<string, MotorOption>();
  for (const p of products) {
    const seen = new Set<string>();
    for (const f of p.fitments) {
      const family = motorFamily(f.model);
      const key = `${f.brand}|${family}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const m = map.get(key) || { brand: f.brand, family, label: family, count: 0 };
      m.count++;
      map.set(key, m);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
