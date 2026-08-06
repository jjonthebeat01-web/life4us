export function Avatar({
  label,
  active = false,
  size = "sm",
}: {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <span
      className={`inline-flex ${dim} items-center justify-center rounded-full font-utility font-medium border ${
        active
          ? "bg-flash-pink text-paper border-flash-pink"
          : "bg-black/30 text-mist border-white/10"
      }`}
    >
      {label}
    </span>
  );
}
