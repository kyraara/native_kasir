import test from 'node:test';
import assert from 'node:assert/strict';
import { initialProducts } from '../data/mockData';
import { searchProducts, findByExactCode, listMotors } from './search';
import { mergeCandidates, defaultQuery } from './photoMatch';
import { parseCsv, parseProductCsv, parseNumber, parsePartType, parseFitments } from './productCsv';

const names = (q: string, opts = {}) => searchProducts(initialProducts, q, opts).map((p) => p.name);

test('pencarian: salah ketik & sinonim', () => {
  assert.ok(names('kmpas beat')[0].startsWith('Kampas'));
  assert.ok(names('vanbelt vario')[0].includes('V-Belt'));
  assert.ok(names('laher roda')[0].includes('Bearing'));
  assert.deepEqual(names('xyz123'), []);
});

test('pencarian: part number tanpa strip & tahun motor', () => {
  assert.equal(names('06455k44')[0], 'Kampas Rem Depan Beat FI / Vario');
  assert.equal(names('06455-K44-V01')[0], 'Kampas Rem Depan Beat FI / Vario');
  assert.ok(names('kampas beat 2018').length > 0);
  assert.deepEqual(names('beat 1990'), []);
});

test('filter motor per keluarga model', () => {
  const beat = listMotors(initialProducts).find((m) => m.family === 'Beat');
  assert.ok(beat && beat.count > 0);
  const res = searchProducts(initialProducts, '', { motor: { brand: 'Honda', family: 'Beat' } });
  assert.ok(res.every((p) => p.fitments.some((f) => f.model.startsWith('Beat'))));
});

test('scan barcode persis', () => {
  assert.equal(findByExactCode(initialProducts, '8991234560029')?.part_number, 'CPR8EA-9');
  assert.equal(findByExactCode(initialProducts, '12'), undefined);
});

test('CSV: kutip, pemisah ; dan angka format Indonesia', () => {
  assert.deepEqual(parseCsv('a;b\r\n"x; ""y""";2\r\n'), [['a', 'b'], ['x; "y"', '2']]);
  const { rows, missingColumns } = parseProductCsv('﻿SKU,Nama Produk,Harga Ecer\nA-1,Busi,"Rp 28.000"\n');
  assert.deepEqual(missingColumns, []);
  assert.equal(parseNumber(rows[0].sell_price), 28000);
  assert.equal(parseNumber(''), null);
  assert.equal(parsePartType('Original'), 'oem');
  assert.equal(parsePartType('copotan'), 'used');
  assert.equal(parsePartType('palsu'), null);
});

test('CSV: kompatibilitas motor', () => {
  const { fitments, errors } = parseFitments('Honda Beat FI 2016-2020; Yamaha NMAX 155 2015, Honda Vario 160 2022-');
  assert.equal(fitments.length, 3);
  assert.deepEqual(fitments[0], { brand: 'Honda', model: 'Beat FI', year_from: 2016, year_to: 2020 });
  assert.equal(fitments[1].year_to, 2015);
  assert.equal(fitments[2].year_to, new Date().getFullYear());
  assert.deepEqual(errors, []);
  assert.deepEqual(parseFitments('Beat').errors, ['Beat']);
});

test('cari pakai foto: part number terbaca → Sangat mirip di urutan pertama', () => {
  const reading = { part_type: 'Busi', features: [], part_number_ocr: 'CPR8EA-9', estimated_motor: ['Honda Beat'], suggested_keywords: ['busi'] };
  const res = mergeCandidates(initialProducts, null, reading, defaultQuery(reading));
  assert.equal(res[0].product.part_number, 'CPR8EA-9');
  assert.equal(res[0].match_level, 'Sangat mirip');
});

test('cari pakai foto: visual + kata kunci digabung, maks 5', () => {
  const visual = [
    { product_id: 'prod-6', score: 0.93 },
    { product_id: 'prod-1', score: 0.7 },
    { product_id: 'prod-2', score: 0.55 },
  ];
  const reading = { part_type: 'Kampas rem', features: [], part_number_ocr: null, estimated_motor: [], suggested_keywords: ['kampas'] };
  const res = mergeCandidates(initialProducts, visual, reading, 'kampas');
  assert.ok(res.length <= 5);
  assert.equal(res[0].product.id, 'prod-6');
  assert.ok(!res.some((r) => r.product.id === 'prod-2' && r.reason.includes('Foto'))); // skor visual terlalu rendah diabaikan
});

test('cari pakai foto: tanpa AI & tanpa visual → kosong (tidak mengarang hasil)', () => {
  assert.deepEqual(mergeCandidates(initialProducts, null, null, ''), []);
});
