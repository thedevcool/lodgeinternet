/** "Ayoni Block A" → "ayoni-block-a" */
export function toHostelSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** "ayoni-block-a" → "Ayoni Block A" (best-effort, use hostel list to get exact name) */
export function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
