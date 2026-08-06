import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "w-full rounded-[14px] py-4 font-body font-semibold text-[15px] tracking-[0.02em] transition-all duration-150 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  const variants: Record<Variant, string> = {
    primary:
      "bg-flash-pink text-paper shadow-[0_10px_25px_-12px_rgba(232,84,122,0.65)] hover:bg-[#d94b70] disabled:bg-mist/30 disabled:text-mist disabled:shadow-none",
    secondary:
      "bg-film-black/85 text-paper border border-white/20 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.55)] hover:bg-ink hover:border-flash-pink/40 hover:text-flash-pink disabled:bg-white/5 disabled:text-mist disabled:border-white/10",
    ghost:
      "bg-white/10 text-paper border border-white/10 hover:bg-flash-pink/15 hover:border-flash-pink/35 hover:text-paper disabled:text-mist disabled:bg-transparent disabled:border-white/10",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
