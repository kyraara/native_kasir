import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMovingAverageCost,
  calculateGrossProfit,
  calculateChange,
  getQuickCashOptions,
  calculateInventoryValue,
  calculateSuggestedRestock,
  formatRupiah,
} from './pricing.ts';

test('calculateMovingAverageCost updates weighted moving average accurately', () => {
  // Existing: 10 units at Rp 30.000 (total Rp 300.000)
  // New purchase: 10 units at Rp 40.000 (total Rp 400.000)
  // Total: 20 units at Rp 700.000 -> Rp 35.000
  const avg1 = calculateMovingAverageCost(10, 30000, 10, 40000);
  assert.equal(avg1, 35000);

  // Existing: 5 units at Rp 10.000. New: 15 units at Rp 20.000.
  // (5*10000 + 15*20000) / 20 = (50000 + 300000) / 20 = 17500
  const avg2 = calculateMovingAverageCost(5, 10000, 15, 20000);
  assert.equal(avg2, 17500);

  // When old stock was 0, new avg cost is the purchase price
  const avgZero = calculateMovingAverageCost(0, 50000, 5, 42000);
  assert.equal(avgZero, 42000);
});

test('calculateGrossProfit calculates revenue minus cost and discounts', () => {
  // Revenue 118.000, cost 80.000, discount 5.000 -> 33.000
  const profit = calculateGrossProfit(118000, 80000, 5000);
  assert.equal(profit, 33000);
});

test('calculateChange returns correct difference or 0 if insufficient', () => {
  assert.equal(calculateChange(118000, 150000), 32000);
  assert.equal(calculateChange(118000, 100000), 0);
  assert.equal(calculateChange(118000, 118000), 0);
});

test('getQuickCashOptions generates valid cash choices including exact amount', () => {
  const options = getQuickCashOptions(118000);
  assert.ok(options.includes(118000), 'Must include exact cash option');
  assert.ok(options.every((opt) => opt >= 118000), 'All quick options should cover the total');
});

test('calculateInventoryValue calculates total inventory worth', () => {
  const items = [
    { stock_qty: 10, avg_cost: 30000 },
    { stock_qty: 4, avg_cost: 25000 },
    { stock_qty: -2, avg_cost: 15000 }, // Negative stock should not produce negative inventory value
  ];
  const value = calculateInventoryValue(items);
  // 10*30000 + 4*25000 + 0 = 300.000 + 100.000 = 400.000
  assert.equal(value, 400000);
});

test('calculateSuggestedRestock recommends appropriate reorder quantity', () => {
  // Min stock 5, current 1, sales last 30d 12
  const restock = calculateSuggestedRestock(1, 5, 12);
  assert.ok(restock >= 5);
});

test('formatRupiah formats currency in Indonesian locale', () => {
  const res = formatRupiah(118000, true);
  assert.ok(res.includes('118.000'));
});
