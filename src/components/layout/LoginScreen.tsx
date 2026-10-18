import React, { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { login } from '../../utils/api';
import { BrandLogo, Mascot, MascotName } from '../common/Brand';

export function FullScreenMessage({
  text,
  action,
  mascot = 'loading',
}: {
  text: string;
  action?: { label: string; onClick: () => void };
  mascot?: MascotName;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4 bg-[#ECEDEF] text-sm text-[#5B5B63]">
      <Mascot name={mascot} size={160} className={mascot === 'loading' ? 'animate-pulse' : ''} />
      <p className="text-center max-w-sm">{text}</p>
      {action && (
        <button onClick={action.onClick} className="px-4 py-2 rounded-[10px] bg-[#111113] text-white text-xs font-semibold">
          {action.label}
        </button>
      )}
    </div>
  );
}

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(password);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Gagal login');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#ECEDEF]">
      <form onSubmit={handleSubmit} className="panel w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Mascot name="login" size={140} />
          <BrandLogo height={52} />
          <p className="text-xs text-[#6E6E76]">Masuk sebagai pemilik toko</p>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[#5B5B63]">Password</span>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-[#F4F4F5] border border-[#E4E4E7] focus-within:border-[#111113]">
            <Lock size={14} className="text-[#6E6E76]" />
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm text-[#111113]"
              autoComplete="current-password"
            />
          </div>
        </label>

        {error && <p className="text-xs text-[#B91C1C]">{error}</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="py-2.5 rounded-[10px] bg-[#111113] hover:bg-[#27272A] disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Masuk
        </button>
      </form>
    </div>
  );
}
