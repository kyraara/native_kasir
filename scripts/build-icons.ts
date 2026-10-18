// npm run icons → buat favicon & ikon PWA di public/ dari SVG brand di src/image/svg
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve('src/image/svg/ikon');
const OUT = path.resolve('public');
const LIME = '#D4F54A';

await fs.mkdir(path.join(OUT, 'icons'), { recursive: true });
await fs.copyFile(path.join(SRC, 'favicon.svg'), path.join(OUT, 'favicon.svg'));

const icon = await fs.readFile(path.join(SRC, 'icon-lime.svg'));
const mark = await fs.readFile(path.join(SRC, 'mark.svg'));

for (const size of [192, 512]) {
  await sharp(icon, { density: 400 }).resize(size, size).png().toFile(path.join(OUT, 'icons', `icon-${size}.png`));
}
await sharp(icon, { density: 400 }).resize(180, 180).png().toFile(path.join(OUT, 'icons', 'apple-touch-icon.png'));
await sharp(icon, { density: 400 }).resize(32, 32).png().toFile(path.join(OUT, 'favicon-32.png'));

// Maskable: burung hantu di tengah area aman 80%, latar lime penuh (Android memotong jadi lingkaran/squircle)
const inner = await sharp(mark, { density: 400 }).resize(330, 330, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: LIME } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(path.join(OUT, 'icons', 'maskable-512.png'));

console.log('✓ Ikon dibuat di public/icons');
