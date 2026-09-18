import { Building2, MapPin, GraduationCap } from "lucide-react";
import { cx } from "./cx";

/**
 * Thumbnail for a hostel or location. The data has no photos, so each name
 * gets a soft gradient tile picked deterministically from six palettes.
 * Palettes are full literal class strings — never build these dynamically,
 * Tailwind would silently drop them.
 */
const PALETTES = [
  "from-sky-400 to-blue-600",
  "from-indigo-400 to-violet-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-600",
  "from-cyan-400 to-sky-600",
] as const;

const SIZES = {
  sm: "h-10 w-10 rounded-[11px] [&_svg]:h-[18px] [&_svg]:w-[18px]",
  md: "h-12 w-12 rounded-[13px] [&_svg]:h-5 [&_svg]:w-5",
  lg: "h-16 w-16 rounded-[18px] [&_svg]:h-7 [&_svg]:w-7",
} as const;

function paletteFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

export default function Monogram({
  name,
  kind = "hostel",
  size = "md",
  className,
}: {
  name: string;
  kind?: "hostel" | "location" | "school";
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = kind === "school" ? GraduationCap : kind === "location" ? MapPin : Building2;
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]",
        paletteFor(name),
        SIZES[size],
        className,
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}
