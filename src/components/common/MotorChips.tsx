import React from 'react';
import type { MotorFilter, MotorOption } from '../../utils/search';

interface MotorChipsProps {
  motors: MotorOption[];
  value: MotorFilter | null;
  onChange: (m: MotorFilter | null) => void;
  /** Jumlah chip yang tampil; sisanya masuk dropdown "Motor lain" */
  maxChips?: number;
  size?: 'sm' | 'md';
}

const same = (a: MotorFilter | null, b: MotorFilter | null) =>
  !!a && !!b && a.brand === b.brand && a.family === b.family;

export function MotorChips({ motors, value, onChange, maxChips = 6, size = 'md' }: MotorChipsProps) {
  const chips = motors.slice(0, maxChips);
  const rest = motors.slice(maxChips);
  const selectedInRest = rest.find((m) => same(m, value));

  const base =
    size === 'sm'
      ? 'px-2.5 sm:px-3 py-1 rounded-[8px] text-[11px]'
      : 'px-3 py-1.5 rounded-[10px] text-xs';
  const on = 'bg-[#111113] text-white font-semibold shadow-xs';
  const off = 'bg-[#F4F4F5] text-[#5B5B63] hover:text-[#111113]';

  return (
    <>
      <button onClick={() => onChange(null)} className={`${base} font-medium shrink-0 ${!value ? on : off}`}>
        Semua
      </button>
      {chips.map((m) => (
        <button
          key={`${m.brand}|${m.family}`}
          onClick={() => onChange(same(m, value) ? null : { brand: m.brand, family: m.family })}
          title={`${m.brand} ${m.family} · ${m.count} part`}
          className={`${base} font-medium shrink-0 ${same(m, value) ? on : off}`}
        >
          {m.label}
        </button>
      ))}
      {rest.length > 0 && (
        <select
          value={selectedInRest ? `${selectedInRest.brand}|${selectedInRest.family}` : ''}
          onChange={(e) => {
            const m = rest.find((r) => `${r.brand}|${r.family}` === e.target.value);
            onChange(m ? { brand: m.brand, family: m.family } : null);
          }}
          className={`${base} font-medium shrink-0 outline-none cursor-pointer ${selectedInRest ? on : off}`}
        >
          <option value="">Motor lain…</option>
          {rest.map((m) => (
            <option key={`${m.brand}|${m.family}`} value={`${m.brand}|${m.family}`}>
              {m.brand} {m.family} ({m.count})
            </option>
          ))}
        </select>
      )}
    </>
  );
}
