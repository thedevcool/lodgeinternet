import { apiUrl } from "@/lib/apiClient";
import { cx } from "@/components/ui/cx";

/**
 * A post's cover illustration. Readers get the approved drawing from the API
 * (`src`, an address that changes with the drawing); the review page passes
 * the SVG it was sent (`svg`), since the reviewer's copy isn't public yet.
 *
 * Covers are decoration (shapes only, never words: backend/app/blog/checks.py),
 * so they carry an empty alt and screen readers skip them. The box keeps the
 * drawing's 1200 × 630 shape, so the page doesn't jump when it loads.
 */
export default function BlogCover({ src, svg, className }: { src?: string | null; svg?: string | null; className?: string }) {
  const address = svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : src ? apiUrl(src) : null;
  if (!address) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an SVG from our own API: nothing for next/image to optimise
    <img
      src={address}
      alt=""
      loading="lazy"
      decoding="async"
      className={cx("block aspect-[1200/630] w-full bg-surface-2 object-cover", className)}
    />
  );
}
