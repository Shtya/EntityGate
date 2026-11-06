import { cn } from "@/lib/utils";

/** Gate glyph: two pillars under an arch. Fixed brand colours, so it reads on any surface. */
export function BrandMark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("shrink-0", className)} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#1c4478" />
      <path d="M6.5 18.5V11a5.5 5.5 0 0 1 11 0v7.5" stroke="#dcab5f" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 18.5v-5.25a2 2 0 0 1 4 0v5.25" stroke="#fff" strokeOpacity=".92" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 18.5h14" stroke="#fff" strokeOpacity=".92" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Always LTR: it's a product name, in both languages. */
export function Wordmark({ className, textOnly }: { className?: string; textOnly?: boolean }) {
  const text = (
    <span dir="ltr" className="text-[15px] font-semibold tracking-[-0.02em]">
      Entity<span className="font-normal opacity-60">Gate</span>
    </span>
  );
  if (textOnly) return text;
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={28} />
      {text}
    </span>
  );
}
