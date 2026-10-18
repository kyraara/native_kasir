import test from 'node:test';
import assert from 'node:assert/strict';
import { crc16, parseTlv, buildTlv, inspectQris, makeDynamicQris } from './qris';

// QRIS statis contoh (fiktif, bukan merchant asli) dengan struktur seperti QRIS DANA/bank
function sampleStatic(): string {
  const body = buildTlv([
    { tag: '00', value: '01' },
    { tag: '01', value: '11' },
    { tag: '26', value: buildTlv([{ tag: '00', value: 'ID.DANA.WWW' }, { tag: '01', value: '936009150000000001' }, { tag: '02', value: '000000000001' }, { tag: '03', value: 'UMI' }]) },
    { tag: '51', value: buildTlv([{ tag: '00', value: 'ID.CO.QRIS.WWW' }, { tag: '02', value: 'ID1020000000001' }, { tag: '03', value: 'UMI' }]) },
    { tag: '52', value: '5533' },
    { tag: '53', value: '360' },
    { tag: '55', value: '01' }, // pembeli diminta tip
    { tag: '58', value: 'ID' },
    { tag: '59', value: 'NATIVE MOTOR' },
    { tag: '60', value: 'PALEMBANG' },
    { tag: '61', value: '30126' },
  ]) + '6304';
  return body + crc16(body);
}

test('CRC-16/CCITT-FALSE sesuai vektor uji standar ("123456789" = 29B1)', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('QRIS statis terbaca: nama merchant & kota', () => {
  const info = inspectQris(sampleStatic());
  assert.equal(info.merchantName, 'NATIVE MOTOR');
  assert.equal(info.city, 'PALEMBANG');
  assert.equal(info.isStatic, true);
  assert.equal(info.hasAmount, false);
});

test('QRIS dinamis: nominal masuk tag 54, tag 01 = 12, tip dibuang, CRC valid', () => {
  const dyn = makeDynamicQris(sampleStatic(), 146700);
  const items = parseTlv(dyn);
  const get = (t: string) => items.find((x) => x.tag === t)?.value;
  assert.equal(get('01'), '12');
  assert.equal(get('54'), '146700');
  assert.equal(get('55'), undefined);
  assert.equal(get('59'), 'NATIVE MOTOR');
  // urutan tag naik, 54 setelah 53 dan sebelum 58, CRC terakhir
  const tags = items.map((x) => x.tag);
  assert.deepEqual(tags, [...tags].sort((a, b) => (a === '63' ? 1 : b === '63' ? -1 : Number(a) - Number(b))));
  assert.equal(tags.at(-1), '63');
  assert.doesNotThrow(() => inspectQris(dyn)); // CRC hasil hitung ulang valid
  assert.equal(inspectQris(dyn).isStatic, false);
});

test('membuat ulang dari QR yang sudah bernominal → nominal diganti, bukan dobel', () => {
  const once = makeDynamicQris(sampleStatic(), 1000);
  const twice = makeDynamicQris(once, 25000);
  const tags54 = parseTlv(twice).filter((x) => x.tag === '54');
  assert.equal(tags54.length, 1);
  assert.equal(tags54[0].value, '25000');
});

test('tolak kode yang bukan QRIS / rusak', () => {
  assert.throws(() => inspectQris('https://contoh.com'), /bukan kode QRIS/);
  const broken = sampleStatic().slice(0, -4) + '0000';
  assert.throws(() => inspectQris(broken), /CRC/);
  assert.throws(() => makeDynamicQris(sampleStatic(), 0), /lebih dari 0/);
});
