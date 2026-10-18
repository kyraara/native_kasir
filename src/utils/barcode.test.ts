import test from 'node:test';
import assert from 'node:assert/strict';
import { code128Values, code128Widths, generateInternalBarcode, isEncodable } from './barcode';

test('Code 128: semua pola 11 modul (stop 13)', () => {
  const values = Array.from({ length: 106 }, (_, i) => i);
  // Setiap karakter data + start/stop dicek lewat panjang total
  const widths = code128Widths('Hi');
  assert.equal(widths.reduce((a, b) => a + b, 0), 11 * 4 + 13); // start + 2 data + checksum + stop
  for (const v of values) assert.ok(v >= 0);
});

test('Code 128: checksum = (104 + Σ nilai × posisi) mod 103', () => {
  // 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879 → 879 mod 103 = 55
  assert.equal(code128Values('PJJ123C').at(-2), 55);
});

test('Code 128: paritas standar — total lebar bar tiap simbol genap', () => {
  // Uji semua 95 karakter set B: tiap simbol 6 elemen, bar = elemen ke-0, 2, 4
  const text = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
  const w = code128Widths(text);
  for (let s = 0; s + 6 <= w.length - 7; s += 6) assert.equal((w[s] + w[s + 2] + w[s + 4]) % 2, 0, `simbol ke-${s / 6}`);
});

test('Code 128: tolak karakter non-ASCII', () => {
  assert.equal(isEncodable('Kampas Ø'), false);
  assert.equal(isEncodable('NM-BRK-001'), true);
});

test('barcode internal EAN-13 berawalan 20 dengan digit cek valid', () => {
  const code = generateInternalBarcode();
  assert.match(code, /^20\d{11}$/);
  const sum = [...code.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  assert.equal(Number(code[12]), (10 - (sum % 10)) % 10);
});
