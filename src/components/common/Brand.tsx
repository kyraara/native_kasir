import React from 'react';
import iconLime from '../../image/svg/ikon/icon-lime.svg';
import iconDark from '../../image/svg/ikon/icon-dark.svg';
import logoLight from '../../image/svg/logo/logo-native-motor-light.svg';
import logoDark from '../../image/svg/logo/logo-native-motor-dark.svg';
import login from '../../image/svg/maskot/01-login.svg';
import dataKosong from '../../image/svg/maskot/02-data-kosong.svg';
import pencarianKosong from '../../image/svg/maskot/03-pencarian-kosong.svg';
import error404 from '../../image/svg/maskot/04-error-404.svg';
import aksesDitolak from '../../image/svg/maskot/05-akses-ditolak.svg';
import sukses from '../../image/svg/maskot/06-sukses.svg';
import loading from '../../image/svg/maskot/07-loading.svg';
import maintenance from '../../image/svg/maskot/08-maintenance.svg';
import koneksi from '../../image/svg/maskot/09-koneksi-bermasalah.svg';
import segeraHadir from '../../image/svg/maskot/10-segera-hadir.svg';
import tidakDitemukan from '../../image/svg/maskot/11-halaman-tidak-ditemukan.svg';
import keranjangKosong from '../../image/svg/maskot/12-keranjang-kosong.svg';

const MASCOTS = {
  login,
  'data-kosong': dataKosong,
  'pencarian-kosong': pencarianKosong,
  'error-404': error404,
  'akses-ditolak': aksesDitolak,
  sukses,
  loading,
  maintenance,
  koneksi,
  'segera-hadir': segeraHadir,
  'tidak-ditemukan': tidakDitemukan,
  'keranjang-kosong': keranjangKosong,
} as const;

export type MascotName = keyof typeof MASCOTS;

/** Ilustrasi maskot burung hantu Native Motor */
export function Mascot({ name, size = 120, className = '' }: { name: MascotName; size?: number; className?: string }) {
  return <img src={MASCOTS[name]} alt="" aria-hidden="true" width={size} height={size} className={`select-none ${className}`} draggable={false} />;
}

/** Tampilan kosong / error dengan maskot + judul + keterangan */
export function EmptyState({
  mascot,
  title,
  description,
  action,
  size = 120,
}: {
  mascot: MascotName;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-1.5 py-8 px-4">
      <Mascot name={mascot} size={size} />
      <p className="text-sm font-semibold text-[#111113] mt-1">{title}</p>
      {description && <p className="text-xs text-[#71717A] max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Ikon aplikasi (kotak lime / gelap) */
export function AppIcon({ size = 32, variant = 'lime', className = '' }: { size?: number; variant?: 'lime' | 'dark'; className?: string }) {
  return <img src={variant === 'lime' ? iconLime : iconDark} alt="Native Motor" width={size} height={size} className={`shrink-0 ${className}`} />;
}

/** Logo lengkap "NATIVE MOTOR" */
export function BrandLogo({ height = 48, onDark = false, className = '' }: { height?: number; onDark?: boolean; className?: string }) {
  return <img src={onDark ? logoDark : logoLight} alt="Native Motor" style={{ height }} className={`w-auto ${className}`} />;
}
