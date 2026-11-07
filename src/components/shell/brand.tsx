import { cn } from "@/lib/utils";

/** Gate glyph: two pillars under an arch. Fixed brand colours, so it reads on any surface. */
export function BrandMark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={cn("shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="7.5" fill="#1c4478" />
      <path d="M7.5 26V14.5a8.5 8.5 0 0 1 17 0V26" stroke="#e0ae5e" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M12.75 26v-10.5a3.25 3.25 0 0 1 6.5 0V26z" fill="#fff" />
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
