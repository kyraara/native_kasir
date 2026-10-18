// Uji keamanan & ketahanan input (black-box).
// PERINGATAN: jalankan ke server UJI, bukan data toko asli (skrip ini mencoba transaksi, upload, dan edit pengaturan lalu mengembalikannya).
//   npm run test:security                                   → server dev http://localhost:3000, password nativemotor123
//   PT_HOST=http://localhost:3001 PT_PW=xxx PT_PROD=1 npm run test:security   → server produksi lokal (cek CSP, reset dimatikan, dll.)
const H = process.env.PT_HOST || 'http://localhost:3000';
const PW = process.env.PT_PW || 'nativemotor123';
const results = [];
const ok = (area, label, cond, extra = '') => {
  results.push({ area, label, pass: !!cond, extra });
  console.log(`${cond ? '✓' : '✗'} [${area}] ${label} ${extra}`);
};
const raw = (method, path, body, headers = {}) =>
  fetch(H + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined });

// ---------- 1. Akses tanpa login ----------
const routes = [
  ['GET', '/api/bootstrap'], ['GET', '/api/backup'], ['POST', '/api/backup/restore'], ['POST', '/api/backup/reset-demo'],
  ['PUT', '/api/products/x'], ['POST', '/api/products/import'], ['POST', '/api/sales'], ['POST', '/api/sales/x/void'],
  ['POST', '/api/sales/x/returns'], ['POST', '/api/purchases'], ['POST', '/api/purchases/x/payments'], ['POST', '/api/stock/adjust'],
  ['PUT', '/api/settings'], ['GET', '/api/reports/period?from=2026-01-01&to=2026-01-02'], ['GET', '/api/dashboard'],
  ['POST', '/api/uploads/product-photo'], ['POST', '/api/ai/photo-search'], ['GET', '/api/ai/status'], ['POST', '/api/expenses'],
  ['DELETE', '/api/expenses/x'], ['PUT', '/api/opnames/x'], ['POST', '/api/opnames/x/finalize'], ['GET', '/api/movements'],
];
let allBlocked = true;
for (const [m, p] of routes) {
  const r = await raw(m, p, m === 'GET' ? null : {});
  if (r.status !== 401) {
    allBlocked = false;
    console.log('   bocor:', m, p, r.status);
  }
}
ok('auth', `${routes.length} endpoint menolak akses tanpa login`, allBlocked);

const forged = [`${Date.now() + 1e9}.AAAA`, `9999999999999.${'A'.repeat(43)}`, 'abc', '.', `${Date.now() - 1000}.x`];
let forgedBlocked = true;
for (const t of forged) if ((await raw('GET', '/api/bootstrap', null, { Authorization: `Bearer ${t}` })).status !== 401) forgedBlocked = false;
ok('auth', 'token palsu / rusak / kedaluwarsa ditolak', forgedBlocked);

const login = await raw('POST', '/api/auth/login', { password: PW });
const { token } = await login.json();
const A = { Authorization: `Bearer ${token}` };
const call = async (m, p, b) => {
  const r = await raw(m, p, b, A);
  let data;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
};
ok('auth', 'password kosong / objek / array ditolak', (await raw('POST', '/api/auth/login', { password: { $ne: 1 } })).status === 401 && (await raw('POST', '/api/auth/login', {})).status === 401);

// ---------- 2. Kebocoran pesan error ----------
const bad = await call('POST', '/api/sales', { items: [{ product_id: 'x'.repeat(5000), qty: 1, price: 1 }], payment_method: 'cash' });
ok('info', 'error tidak membocorkan detail SQL', !JSON.stringify(bad.data).match(/sql|SELECT|INSERT|ER_|stack/i), `${bad.status} ${JSON.stringify(bad.data).slice(0, 120)}`);
const malformed = await raw('POST', '/api/sales', '{"items": [', A);
const malText = await malformed.text();
ok('info', 'JSON rusak → 400 tanpa stack trace', malformed.status === 400 && !/at .*\.(js|ts):\d+/.test(malText), `${malformed.status} ${malText.slice(0, 80)}`);

// ---------- 3. Payload besar ----------
const big = await raw('POST', '/api/auth/login', { password: 'x'.repeat(5 * 1024 * 1024) });
ok('dos', 'login menolak body 5 MB', big.status === 413, String(big.status));

// ---------- 4. Validasi angka transaksi ----------
const boot = (await call('GET', '/api/bootstrap')).data;
const p1 = boot.products.find((p) => p.id === 'prod-1');
const cases = [
  ['qty negatif', { qty: -5, price: 45000 }],
  ['qty nol', { qty: 0, price: 45000 }],
  ['qty pecahan → dibulatkan/ ditolak', { qty: 0.4, price: 45000 }],
  ['qty teks', { qty: 'abc', price: 45000 }],
  ['qty raksasa', { qty: 1e12, price: 1 }],
  ['harga negatif', { qty: 1, price: -1000 }],
  ['harga raksasa', { qty: 1, price: 1e20 }],
];
for (const [label, it] of cases) {
  const r = await call('POST', '/api/sales', { items: [{ product_id: 'prod-1', discount: 0, ...it }], discount: 0, payment_method: 'cash' });
  ok('validasi', `jual: ${label} → ditolak (4xx)`, r.status >= 400 && r.status < 500, `${r.status} ${r.data?.error || ''}`);
}
const pm = await call('POST', '/api/sales', { items: [{ product_id: 'prod-1', qty: 1, price: 45000, discount: 0 }], discount: 0, payment_method: 'bitcoin' });
ok('validasi', 'metode bayar tidak dikenal ditolak', pm.status === 400);
const pur = await call('POST', '/api/purchases', { supplier_id: 'sup-1', invoice_no: 'x', due_date: '2026-12-01', payment_status: 'credit', paid_amount: 0, items: [{ product_id: 'prod-1', qty: 5e9, cost: 1000 }] });
ok('validasi', 'beli qty melebihi batas INT ditolak (4xx, bukan 500)', pur.status >= 400 && pur.status < 500, `${pur.status} ${pur.data?.error || ''}`);
const adj = await call('POST', '/api/stock/adjust', { product_id: 'prod-1', new_stock_qty: 9e15, reason: 'koreksi' });
ok('validasi', 'penyesuaian stok ekstrem ditolak (4xx)', adj.status >= 400 && adj.status < 500, `${adj.status} ${adj.data?.error || ''}`);
const exp = await call('POST', '/api/expenses', { date: '2026-13-45', category: 'x', amount: 1000 });
ok('validasi', 'tanggal biaya tidak valid ditolak', exp.status === 400, `${exp.status} ${exp.data?.error || ''}`);
const rep = await call('GET', '/api/reports/period?from=2026-01-01%27%20OR%201=1--&to=2026-01-02');
ok('validasi', 'parameter laporan berisi injeksi ditolak', rep.status === 400);

// ---------- 5. Mass assignment ----------
const save = await call('PUT', '/api/products/prod-1', { ...p1, stock_qty: 99999, avg_cost: 1 });
const after = (await call('GET', '/api/bootstrap')).data.products.find((p) => p.id === 'prod-1');
ok('integritas', 'edit produk tidak bisa mengubah stok/HPP langsung', save.status === 200 && after.stock_qty === p1.stock_qty && after.avg_cost === p1.avg_cost);
const fit = await call('PUT', '/api/products/prod-1', { ...p1, fitments: [{ brand: 'Honda', model: 'Beat', year_from: 99999, year_to: -5 }] });
ok('validasi', 'tahun kompatibilitas tidak masuk akal ditolak (4xx)', fit.status >= 400 && fit.status < 500, `${fit.status} ${fit.data?.error || ''}`);

// ---------- 6. Path traversal lewat URL foto ----------
const trav = await call('PUT', '/api/products/prod-1', { ...p1, photos: ['/uploads/../.env', '/uploads/products/../../server/auth.ts', 'javascript:alert(1)', 'https://evil.example/x.png'] });
const afterTrav = (await call('GET', '/api/bootstrap')).data.products.find((p) => p.id === 'prod-1');
ok('traversal', 'URL foto di luar uploads/products ditolak', trav.status === 400 || !afterTrav.photos.some((u) => /\.\.|javascript:|evil/.test(u)), `${trav.status} ${trav.data?.error || JSON.stringify(afterTrav.photos)}`);
await call('PUT', '/api/products/prod-1', p1); // kembalikan
const qr = await call('PUT', '/api/settings', { ...boot.settings, qris_image_url: '/uploads/../.env' });
ok('traversal', 'URL QRIS di luar uploads ditolak', qr.status === 200 && qr.data.qris_image_url === '');
await call('PUT', '/api/settings', boot.settings);
for (const path of ['/uploads/products/../../.env', '/uploads/products/%2e%2e/%2e%2e/.env', '/uploads/products/..%2f..%2f.env', '/uploads/search/x.webp']) {
  const r = await fetch(H + path);
  const t = await r.text();
  ok('traversal', `GET ${path} tidak membocorkan file`, !t.includes('OWNER_PASSWORD') && !(r.status === 200 && path.includes('search')), String(r.status));
}

// ---------- 7. Upload berbahaya ----------
const svgXss = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
ok('upload', 'SVG (bisa berisi script) ditolak', (await call('POST', '/api/uploads/product-photo', { dataUrl: svgXss })).status === 400);
const htmlAsPng = 'data:image/png;base64,' + Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
ok('upload', 'file HTML menyamar PNG ditolak', (await call('POST', '/api/uploads/product-photo', { dataUrl: htmlAsPng })).status === 400);
ok('upload', 'dataUrl bukan string ditolak', (await call('POST', '/api/uploads/product-photo', { dataUrl: { a: 1 } })).status === 400);

// ---------- 8. XSS tersimpan ----------
const xssName = '<img src=x onerror=alert(document.cookie)>"\'';
const xs = await call('POST', '/api/requests', { description: xssName });
ok('xss', 'teks berisi HTML disimpan apa adanya (React akan meng-escape saat tampil)', xs.status === 200);

// ---------- 9. Header keamanan ----------
const page = await fetch(H + '/');
ok('header', 'nosniff + frame options + tanpa x-powered-by', page.headers.get('x-content-type-options') === 'nosniff' && page.headers.get('x-frame-options') === 'SAMEORIGIN' && !page.headers.get('x-powered-by'));

if (process.env.PT_PROD) {
  const csp = page.headers.get('content-security-policy') || '';
  ok('header', 'Content-Security-Policy aktif di produksi', csp.includes("script-src 'self'") && csp.includes("object-src 'none'"));
  const e500 = await call('POST', '/api/opnames/x/finalize');
  ok('info', 'tidak ada pesan internal di respons error produksi', !('message' in (e500.data || {})), JSON.stringify(e500.data));
  // Upload foto asli → harus tersimpan & tersaji
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await call('POST', '/api/uploads/product-photo', { dataUrl: png });
  ok('upload', 'upload foto valid berhasil di paket hosting', up.status === 200 && /^\/uploads\/products\//.test(up.data.url), up.data.url || JSON.stringify(up.data));
  if (up.data.url) ok('upload', 'foto tersaji', (await fetch(H + up.data.url)).status === 200);
}

// ---------- 10. Aksi yang menghapus seluruh data ----------
const restoreNoPw = await call('POST', '/api/backup/restore', { products: [] });
ok('data', 'pulihkan backup tanpa password konfirmasi ditolak', restoreNoPw.status === 403, `${restoreNoPw.status} ${restoreNoPw.data?.error || ''}`);
const restoreBadPw = await raw('POST', '/api/backup/restore', { products: [] }, { ...A, 'X-Confirm-Password': 'salah' });
ok('data', 'pulihkan backup dengan password salah ditolak', restoreBadPw.status === 403);
if (process.env.PT_PROD) {
  const reset = await raw('POST', '/api/backup/reset-demo', {}, { ...A, 'X-Confirm-Password': PW });
  ok('data', 'reset ke data contoh dimatikan di produksi (walau password benar)', reset.status === 403, String(reset.status));
}
const unknownApi = await call('GET', '/api/tidak-ada');
ok('info', 'alamat API tak dikenal → 404 JSON', unknownApi.status === 404 && !!unknownApi.data?.error);
const cashShort = await call('POST', '/api/sales', { items: [{ product_id: 'prod-1', qty: 1, price: 45000, discount: 0 }], discount: 0, payment_method: 'cash', cash_received: 1000, change_amount: 0 });
ok('validasi', 'tunai kurang dari total ditolak', cashShort.status === 400, cashShort.data?.error || '');

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} lolos`);
