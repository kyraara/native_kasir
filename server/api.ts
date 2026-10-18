import { Router, Request, Response, NextFunction } from 'express';
import { getPool, HttpError } from './db';
import * as repo from './repo';
import * as stock from './stock';
import * as seed from './seed';
import * as reports from './reports';
import * as ai from './ai';
import * as vision from './vision';
import { decodeDataUrl, saveImage, deleteUpload } from './photos';
import { checkPassword, issueToken, requireAuth } from './auth';

export const api = Router();

type Handler = (req: Request, res: Response) => Promise<any>;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// ---------- Auth (tanpa token) ----------

const loginFails = new Map<string, { count: number; until: number }>();

api.post(
  '/auth/login',
  h(async (req, res) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const rec = loginFails.get(ip);
    if (rec && rec.until > now && rec.count >= 10) {
      throw new HttpError(429, `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((rec.until - now) / 60000)} menit.`);
    }
    if (!checkPassword(req.body?.password)) {
      const next = rec && rec.until > now ? { count: rec.count + 1, until: rec.until } : { count: 1, until: now + 15 * 60000 };
      loginFails.set(ip, next);
      if (loginFails.size > 5000) for (const [k, v] of loginFails) if (v.until < now) loginFails.delete(k);
      await new Promise((r) => setTimeout(r, 800)); // perlambat tebak-tebakan password
      throw new HttpError(401, 'Password salah');
    }
    loginFails.delete(ip);
    res.json({ token: issueToken() });
  })
);

// Semua endpoint di bawah ini wajib login
api.use(requireAuth);

api.get('/auth/me', (_req, res) => res.json({ ok: true }));

// ---------- Ambil semua data awal ----------

api.get(
  '/bootstrap',
  h(async (_req, res) => {
    const db = getPool();
    const [products, sales, suppliers, purchases, movements, settings, opnames, requests, saleReturns, purchaseReturns, productStats] =
      await Promise.all([
      repo.listProducts(db),
      repo.listSales(db),
      repo.listSuppliers(db),
      repo.listPurchases(db),
      repo.listMovements(db),
      repo.getSettings(db),
      repo.listOpnames(db),
      repo.listRequests(db),
      repo.listSaleReturns(db),
      repo.listPurchaseReturns(db),
      reports.productStats(db),
    ]);
    res.json({
      products, sales, suppliers, purchases, movements, settings, opnames, requests,
      sale_returns: saleReturns,
      purchase_returns: purchaseReturns,
      product_stats: productStats,
    });
  })
);

// ---------- Master data ----------

api.put(
  '/products/:id',
  h(async (req, res) => {
    const removed = await repo.saveProduct({ ...req.body, id: req.params.id });
    for (const url of removed) await deleteUpload(url);
    vision.invalidateCache();
    vision.scheduleIndexing();
    const [product] = await repo.listProducts(getPool(), [req.params.id]);
    res.json(product);
  })
);

api.post(
  '/products/import',
  h(async (req, res) => {
    res.json(await repo.importProducts(req.body?.items, req.body?.dryRun !== false));
  })
);

api.get('/movements', h(async (req, res) => res.json(await repo.listMovements(getPool(), req.query.product_id as string | undefined))));

api.put(
  '/suppliers/:id',
  h(async (req, res) => {
    await repo.saveSupplier(getPool(), { ...req.body, id: req.params.id });
    res.json({ ok: true });
  })
);

api.put(
  '/settings',
  h(async (req, res) => {
    await repo.saveSettings(getPool(), req.body);
    res.json(await repo.getSettings(getPool()));
  })
);

api.post(
  '/requests',
  h(async (req, res) => {
    await repo.addRequest(getPool(), req.body?.description, req.body?.photo_url);
    res.json({ ok: true });
  })
);

api.patch(
  '/requests/:id',
  h(async (req, res) => {
    await repo.updateRequestStatus(getPool(), req.params.id, req.body?.status);
    res.json({ ok: true });
  })
);

// ---------- Transaksi stok ----------

api.post(
  '/sales',
  h(async (req, res) => {
    const id = await stock.processSale(req.body);
    res.json(await repo.getSale(getPool(), id));
  })
);

api.post(
  '/sales/:id/void',
  h(async (req, res) => {
    await stock.voidSale(req.params.id, req.body?.reason);
    res.json({ ok: true });
  })
);

api.post(
  '/sales/:id/returns',
  h(async (req, res) => {
    await stock.processSaleReturn({ ...req.body, sale_id: req.params.id });
    res.json({ ok: true });
  })
);

api.post(
  '/purchases/:id/returns',
  h(async (req, res) => {
    await stock.processPurchaseReturn({ ...req.body, purchase_id: req.params.id });
    res.json({ ok: true });
  })
);

api.post(
  '/purchases',
  h(async (req, res) => {
    const id = await stock.processPurchase(req.body);
    const [purchase] = await repo.listPurchases(getPool(), [id]);
    res.json(purchase);
  })
);

api.post(
  '/purchases/:id/payments',
  h(async (req, res) => {
    await stock.recordSupplierPayment(req.params.id, req.body?.amount);
    res.json({ ok: true });
  })
);

api.post(
  '/stock/adjust',
  h(async (req, res) => {
    const { product_id, new_stock_qty, reason, note } = req.body || {};
    await stock.manualAdjustStock(product_id, new_stock_qty, reason, note);
    res.json({ ok: true });
  })
);

api.put(
  '/opnames/:id',
  h(async (req, res) => {
    await repo.saveOpname({ ...req.body, id: req.params.id });
    res.json({ ok: true });
  })
);

api.post(
  '/opnames/:id/finalize',
  h(async (req, res) => {
    await stock.finalizeOpname(req.params.id);
    res.json({ ok: true });
  })
);

// ---------- Foto & AI ----------

api.post(
  '/uploads/product-photo',
  h(async (req, res) => res.json({ url: await saveImage(decodeDataUrl(req.body?.dataUrl), 'products') }))
);

api.get('/ai/status', h(async (_req, res) => res.json({ ...(await ai.aiStatus()), accuracy: await ai.accuracyStats() })));

api.post('/ai/photo-search', h(async (req, res) => res.json(await ai.photoSearch(req.body?.imageBase64))));

api.post('/ai/photo-search/:id/read', h(async (req, res) => res.json(await ai.readPhoto(req.params.id))));

api.post(
  '/ai/photo-search/:id/choose',
  h(async (req, res) => res.json(await ai.choose(req.params.id, req.body?.product_id, req.body?.save_reference !== false)))
);

// ---------- Laporan & dashboard ----------

api.get('/dashboard', h(async (_req, res) => res.json(await reports.dashboard(getPool()))));

api.get(
  '/reports/period',
  h(async (req, res) => res.json(await reports.periodReport(getPool(), String(req.query.from), String(req.query.to))))
);

api.get('/reports/snapshot', h(async (_req, res) => res.json(await reports.snapshotReport(getPool()))));

api.get(
  '/expenses',
  h(async (req, res) => res.json(await reports.listExpenses(getPool(), String(req.query.from), String(req.query.to))))
);

api.post(
  '/expenses',
  h(async (req, res) => {
    await reports.addExpense(getPool(), req.body || {});
    res.json({ ok: true });
  })
);

api.delete(
  '/expenses/:id',
  h(async (req, res) => {
    await reports.deleteExpense(getPool(), req.params.id);
    res.json({ ok: true });
  })
);

// ---------- Backup ----------

api.get('/backup', h(async (_req, res) => res.json(await seed.exportBackup())));

/** Aksi yang mengganti seluruh data wajib menyertakan password pemilik (header X-Confirm-Password) */
function requirePasswordConfirm(req: Request) {
  const pw = req.get('x-confirm-password');
  if (!pw || !checkPassword(pw)) throw new HttpError(403, 'Password konfirmasi salah');
}

api.post(
  '/backup/restore',
  h(async (req, res) => {
    requirePasswordConfirm(req);
    await seed.importBackup(req.body);
    vision.invalidateCache();
    vision.scheduleIndexing();
    res.json({ ok: true });
  })
);

api.post(
  '/backup/reset-demo',
  h(async (req, res) => {
    const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
    if (isProd && process.env.ALLOW_DEMO_RESET !== 'true') {
      throw new HttpError(403, 'Reset ke data contoh dimatikan di server produksi agar data toko tidak terhapus.');
    }
    requirePasswordConfirm(req);
    await seed.resetToSeed();
    vision.invalidateCache();
    vision.scheduleIndexing();
    res.json({ ok: true });
  })
);

api.use((_req, res) => res.status(404).json({ error: 'Alamat API tidak ditemukan' }));

// ---------- Error handler ----------

api.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error('[api]', err);
  const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
  res.status(500).json({ error: 'Terjadi kesalahan server', ...(isProd ? {} : { message: err?.message }) });
});
