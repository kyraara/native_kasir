import React from 'react';
import { PartType } from '../../types';

export function StatusDot({
  status,
  isDark = false,
  text,
}: {
  status: 'safe' | 'low' | 'out';
  isDark?: boolean;
  text?: string;
}) {
  const colors = {
    safe: isDark ? 'bg-[#4ADE80]' : 'bg-[#16A34A]',
    low: isDark ? 'bg-[#FBBF24]' : 'bg-[#D97706]',
    out: isDark ? 'bg-[#F87171]' : 'bg-[#DC2626]',
  };

  const textColors = {
    safe: isDark ? 'text-[#4ADE80]' : 'text-[#16A34A]',
    low: isDark ? 'text-[#FBBF24]' : 'text-[#D97706]',
    out: isDark ? 'text-[#F87171]' : 'text-[#DC2626]',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColors[status]}`}>
      <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${colors[status]}`} />
      <span>{text}</span>
    </span>
  );
}

export function PartTypeBadge({ type }: { type: PartType }) {
  if (type === 'oem') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-[#111113] text-[#D4FF3F] uppercase">
        OEM
      </span>
    );
  }
  if (type === 'aftermarket') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-[#E4E4E7] text-[#27272A] uppercase">
        Aftermarket
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-[#FEF3C7] text-[#92400E] uppercase">
      Copotan
    </span>
  );
}
