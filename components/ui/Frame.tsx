import type { ReactNode } from "react";

export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(232,84,122,0.14),_transparent_42%),_var(--color-paper)] p-4 sm:p-6">
      <div className="w-full max-w-[420px] rounded-[var(--radius-frame)] border border-ink/10 bg-[linear-gradient(145deg,_rgba(255,255,255,0.6),_rgba(250,246,240,0.96))] px-5 py-6 shadow-[0_0_0_1px_rgba(43,42,40,0.06),0_24px_70px_-24px_rgba(0,0,0,0.22)]">
        {children}
      </div>
    </div>
  );
}
