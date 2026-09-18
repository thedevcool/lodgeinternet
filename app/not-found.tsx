import Link from "next/link";
import { BrandGlyph } from "@/components/ui/BrandMark";

/**
 * 404 for any unknown URL. Lives outside the (client) group, so it carries
 * its own `.client-root` to pick up the client tokens, font and dark mode.
 */
export default function NotFound() {
  return (
    <div className="client-root flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <BrandGlyph className="h-16 w-16" />
      <p className="ui-eyebrow mt-8 text-accent-ink">Error 404</p>
      <h1 className="ui-title-1 mt-2 text-ink">This page isn’t available</h1>
      <p className="ui-body mt-3 max-w-sm text-ink-2">The link may be old, or the page may have moved.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-[16px] font-semibold text-white transition active:scale-[0.97]"
        >
          Go home
        </Link>
        <Link
          href="/hostels"
          className="inline-flex h-11 items-center rounded-full bg-ink/[0.06] px-5 text-[16px] font-semibold text-ink transition active:scale-[0.97]"
        >
          Find your hostel
        </Link>
      </div>
    </div>
  );
}
