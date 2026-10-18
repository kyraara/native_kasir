import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

// Satu pengguna (pemilik). Password & secret dari .env.
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

let warned = false;
function secret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (!warned) {
    console.warn('[auth] AUTH_SECRET belum diisi di .env — login akan hilang setiap server restart.');
    warned = true;
  }
  return (globalThis as any).__nmSecret ??= randomBytes(32).toString('hex');
}

function sign(payload: string): string {
  const passwordFingerprint = createHmac('sha256', 'nm-pw').update(process.env.OWNER_PASSWORD || '').digest('base64url');
  return createHmac('sha256', secret()).update(`${payload}.${passwordFingerprint}`).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkPassword(password: string): boolean {
  const expected = process.env.OWNER_PASSWORD;
  if (!expected) throw new Error('OWNER_PASSWORD belum diisi di .env');
  return typeof password === 'string' && safeEqual(password, expected);
}

export function issueToken(): string {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (verifyToken(token)) return next();
  res.status(401).json({ error: 'Sesi berakhir, silakan login ulang' });
}
