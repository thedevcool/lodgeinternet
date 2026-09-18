/** "Ayoni Block A" → "ayoni-block-a" */
export function toHostelSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Display-only: names stored in ALL CAPS read as title case, like the Figma.
 *   "ROAD 8, IWOROKO" → "Road 8, Iworoko"
 * Mixed-case names ("H’ALL En-Suite", "SS JAY Hostel") are returned unchanged.
 * Never use the result for slugs or lookups — only for what users read.
 */
export function displayName(name: string): string {
  const isAllCaps = name === name.toUpperCase() && /[A-Z]/.test(name);
  if (!isAllCaps) return name;
  return name.toLowerCase().replace(/(^|[\s\-/("“‘])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "ayoni-block-a" → "Ayoni Block A" (best-effort, use hostel list to get exact name) */
export function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
