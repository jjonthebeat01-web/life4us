export function StripLoader({
  label,
  frames = 4,
}: {
  label?: string;
  frames?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-[88px] rounded-[14px] border border-white/10 bg-film-black/70 overflow-hidden p-1.5 flex flex-col gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        {Array.from({ length: frames }, (_, i) => (
          <div
            key={i}
            className="h-6 rounded-[7px] bg-mist/40"
            style={{
              animation: `strip-print 1.4s ease-in-out ${i * 0.22}s infinite`,
            }}
          />
        ))}
      </div>
      {label && (
        <p className="font-utility text-[11px] uppercase tracking-[0.28em] text-mist">
          {label}
        </p>
      )}
      <style>{`
        @keyframes strip-print {
          0% { opacity: 0.15; transform: scaleY(0.4); background-color: var(--color-mist); }
          35% { opacity: 1; transform: scaleY(1); background-color: var(--color-flash-pink); }
          70% { opacity: 1; transform: scaleY(1); background-color: var(--color-mist); }
          100% { opacity: 0.15; transform: scaleY(0.4); }
        }
      `}</style>
    </div>
  );
}
