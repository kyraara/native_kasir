import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const { api } = await import('./server/api');
const { migrate } = await import('./server/seed');
const vision = await import('./server/vision');
const ai = await import('./server/ai');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

// Konfigurasi wajib sebelum server dibuka
if (!process.env.OWNER_PASSWORD) {
  console.error('✗ OWNER_PASSWORD belum diisi di .env — server tidak dijalankan.');
  process.exit(1);
}
if (isProd && (!process.env.AUTH_SECRET || process.env.OWNER_PASSWORD === 'nativemotor123')) {
  console.warn('⚠ Mode produksi: ganti OWNER_PASSWORD bawaan dan isi AUTH_SECRET di .env!');
}

app.disable('x-powered-by');
// Di cPanel aplikasi berjalan di belakang Apache/LiteSpeed (proxy lokal): pakai IP asli pengunjung dari X-Forwarded-For
app.set('trust proxy', 'loopback');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (isProd) {
    res.setHeader('Content-Security-Policy', CSP);
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }
  next();
});

// Kiriman besar hanya untuk rute yang memang membawa foto / file; sisanya maks. 1 MB
const jsonSmall = express.json({ limit: '1mb' });
const jsonLarge = express.json({ limit: '20mb' });
const LARGE_ROUTES = ['/api/uploads/', '/api/ai/photo-search', '/api/backup/restore', '/api/products/import', '/api/requests'];
app.use((req, res, next) => (LARGE_ROUTES.some((r) => req.path.startsWith(r)) ? jsonLarge : jsonSmall)(req, res, next));
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Data yang dikirim terlalu besar' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid' });
  next(err);
});

// Foto produk boleh diakses publik (tampil di struk WA, katalog, dll).
// Foto pencarian pelanggan (uploads/search) TIDAK disajikan.
app.use('/uploads/products', express.static(path.resolve('uploads/products'), { maxAge: '30d', immutable: true }));
// Selain foto produk, isi folder uploads tidak boleh diakses (dev server Vite akan menyajikan file proyek)
app.use('/uploads', (_req, res) => res.status(404).end());
app.use(['/server', '/db', '/scripts', '/.cache', '/server.ts'], (_req, res) => res.status(404).end());

async function startServer() {
  await migrate();
  app.use('/api', api);

  // Model visual dimuat di latar belakang; foto pelanggan > 30 hari dibersihkan tiap 6 jam
  vision.warmUp();
  const purge = () => ai.purgeOldSearchPhotos().catch((err) => console.warn('[ai] purge gagal:', err?.message));
  purge();
  setInterval(purge, 6 * 60 * 60 * 1000).unref();

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static('dist', {
        index: false,
        setHeaders: (res, filePath) => {
          // Aset ber-hash boleh di-cache lama; halaman & service worker harus selalu dicek ulang
          if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Native Motor ${isProd ? '(produksi)' : '(dev)'} berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer();
