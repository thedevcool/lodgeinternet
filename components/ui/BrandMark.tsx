import Link from "next/link";
import { cx } from "./cx";

/**
 * Lodge Internet brand: the house + Wi-Fi glyph from app/icon.svg, set in a
 * rounded "app icon" tile, plus an Inter wordmark. (The admin <Logo /> is a
 * separate component and is intentionally left alone.)
 */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-gradient-to-b from-[#24406a] to-[#15253d] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
        className,
      )}
    >
      <svg viewBox="12 8 44 48" className="h-[78%] w-[78%]" fill="none">
        <path d="M32 14 Q32 11 35 11 Q43 11 43 14" stroke="#1e9be0" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M29 18 Q29 12 35 12 Q45 12 45 18" stroke="#1e9be0" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M26 22 Q26 12 35 12 Q47 12 47 22" stroke="#1e9be0" strokeWidth="2.5" strokeLinecap="round" />
        <polygon points="18,34 35,22 52,34" fill="white" />
        <rect x="23" y="34" width="24" height="14" fill="white" />
        <rect x="30" y="40" width="10" height="8" rx="1" fill="#1e9be0" />
        <path d="M17,50 Q22,47 28,50 Q34,53 40,50 Q46,47 52,50" stroke="#1e9be0" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function BrandMark({ href = "/", compact }: { href?: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      aria-label="Lodge Internet home"
      className="inline-flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <BrandGlyph className="h-8 w-8" />
      {!compact && <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Lodge Internet</span>}
    </Link>
  );
}
