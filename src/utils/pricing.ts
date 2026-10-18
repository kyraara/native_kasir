/**
 * Pure calculation utilities for Native Motor:
 * Moving average HPP, profit calculations, quick cash, inventory value, and formatting.
 */

export function calculateMovingAverageCost(
  oldStock: number,
  oldAvgCost: number,
  newQty: number,
  purchasePrice: number
): number {
  if (newQty <= 0) return oldAvgCost;
  // If current stock is zero or negative, the new purchase price sets the full baseline
  if (oldStock <= 0) {
    return Math.round(purchasePrice);
  }
  const totalValue = oldStock * oldAvgCost + newQty * purchasePrice;
  const totalQty = oldStock + newQty;
  return Math.round(totalValue / totalQty);
}

export function calculateGrossProfit(
  revenue: number,
  cost: number,
  discount: number = 0
): number {
  return revenue - cost - discount;
}

export function calculateChange(total: number, cashReceived: number): number {
  if (cashReceived < total) return 0;
  return cashReceived - total;
}

export function getQuickCashOptions(total: number): number[] {
  if (total <= 0) return [10000, 20000, 50000, 100000];

  const options: number[] = [total]; // Uang pas

  const denominations = [10000, 20000, 50000, 100000, 200000, 500000];
  for (const denom of denominations) {
    if (denom > total && !options.includes(denom)) {
      options.push(denom);
    }
  }

  // Next round multiples of 10,000 and 50,000 if not already present
  const round10k = Math.ceil(total / 10000) * 10000;
  if (round10k > total && !options.includes(round10k)) {
    options.push(round10k);
  }
  const round50k = Math.ceil(total / 50000) * 50000;
  if (round50k > total && !options.includes(round50k)) {
    options.push(round50k);
  }

  options.sort((a, b) => a - b);
  return options.slice(0, 5);
}

export function calculateInventoryValue(
  products: Array<{ stock_qty: number; avg_cost: number }>
): number {
  return products.reduce((acc, p) => {
    const qty = Math.max(0, p.stock_qty);
    return acc + qty * p.avg_cost;
  }, 0);
}

export function calculateSuggestedRestock(
  stockQty: number,
  minStock: number,
  salesLast30Days: number = 0
): number {
  const safetyBuffer = Math.max(minStock, 3);
  // Suggest buffer + 30-day velocity deficit
  const targetStock = Math.max(safetyBuffer * 2, salesLast30Days);
  const deficit = targetStock - stockQty;
  return Math.max(minStock, deficit > 0 ? deficit : minStock);
}

export function formatRupiah(amount: number, withPrefix: boolean = true): string {
  const value = amount || 0;
  const formatted = new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

  // Minus di depan: "-Rp 5.000", bukan "Rp -5.000"
  const sign = value < 0 ? '-' : '';
  return withPrefix ? `${sign}Rp ${formatted}` : `${sign}${formatted}`;
}

export function formatDateIndo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function formatDateTimeIndo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return dateStr;
  }
}
