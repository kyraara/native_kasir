/** Kompres gambar di browser sebelum upload (FOT-01): sisi terpanjang maks. N px, WebP. */
export async function compressImage(source: Blob | string, maxSide = 1600, quality = 0.82): Promise<string> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    throw new Error('Format gambar tidak didukung browser ini. Coba JPG atau PNG.');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', quality);
  // Safari lama tidak mendukung WebP → jatuh ke JPEG
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
}

/** Potong gambar (koordinat relatif 0..1) → data URL */
export async function cropImage(dataUrl: string, rect: { x: number; y: number; w: number; h: number }): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const sx = Math.round(rect.x * img.naturalWidth);
  const sy = Math.round(rect.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(rect.w * img.naturalWidth));
  const sh = Math.max(1, Math.round(rect.h * img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL('image/webp', 0.9);
}
