import { apiUrl } from "@/lib/apiClient";

/**
 * The blog (lodgeinternet.com/blog). Posts are written as files in the
 * backend (backend/app/blog/posts) and only reach readers once a superadmin
 * approves them at /blog/admin. Pages fetch them here on the server, so they
 * arrive fully written for readers and search engines, refreshed every minute
 * (an approval shows within about a minute).
 *
 * A post's body is blocks, like the legal pages: the website never renders
 * HTML from the API. Inline marks stay in the text and are drawn by
 * components/blog/BlogBody.tsx.
 */
export type BlogBlock =
  | { type: "p" | "h2" | "h3" | "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; lang: string; text: string }
  | { type: "hostels" };

export type BlogSection = { key: string; title: string };

export type BlogSummary = {
  slug: string;
  title: string;
  summary: string;
  section: string;
  sectionTitle: string;
  audience: "customers" | "engineers" | "everyone";
  checked: string;
  published: string | null;
  updated: string | null;
  /** The approved cover illustration's address on the API, if the post has one. */
  cover: string | null;
};

export type BlogPost = BlogSummary & { blocks: BlogBlock[] };

/** What the superadmin's review page gets for each post. */
export type BlogReviewStatus = "waiting" | "update" | "live" | "rejected";
export type BlogReviewRow = Omit<BlogSummary, "published" | "updated" | "cover"> & {
  note: string;
  covers: string[];
  contentHash: string;
  status: BlogReviewStatus;
  published: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** The superadmin has unpublished edits on this post. */
  edited: boolean;
  /** The file changed after those edits were made. */
  draftStale: boolean;
  hasCover: boolean;
  /** Live words, and only the cover illustration is new: one tap approves all of these. */
  coverOnly: boolean;
};

/** One post on the review page: as it would go live (edits applied), what
 * the editor starts from, and any never-publish rule it breaks. */
export type BlogReviewPage = BlogReviewRow & {
  blocks: BlogBlock[];
  /** The cover as drawn now (SVG text), for the reviewer to look at. */
  coverSvg: string | null;
  editor: { title: string; summary: string; body: string };
  problems: string[];
};

const REVALIDATE = { next: { revalidate: 60 } } as const;

export async function fetchBlog(): Promise<{ sections: BlogSection[]; posts: BlogSummary[] } | null> {
  try {
    const res = await fetch(apiUrl("/api/blog"), REVALIDATE);
    if (!res.ok) return null;
    return (await res.json()) as { sections: BlogSection[]; posts: BlogSummary[] };
  } catch {
    return null;
  }
}

export async function fetchBlogPost(slug: string): Promise<BlogPost | null> {
  try {
    const res = await fetch(apiUrl(`/api/blog/${encodeURIComponent(slug)}`), REVALIDATE);
    if (!res.ok) return null;
    return (await res.json()) as BlogPost;
  } catch {
    return null;
  }
}

/** "14 November 2026" from "2026-11-14". */
export function formatBlogDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** About how long a post takes to read, at 220 words a minute. */
export function readingMinutes(blocks: BlogBlock[]): number {
  let words = 0;
  for (const block of blocks) {
    if ("text" in block) words += block.text.split(/\s+/).length;
    if ("items" in block) words += block.items.join(" ").split(/\s+/).length;
  }
  return Math.max(1, Math.round(words / 220));
}

export const AUDIENCE_LABEL: Record<BlogSummary["audience"], string> = {
  customers: "For customers",
  engineers: "For engineers",
  everyone: "For everyone",
};

/** How each review status shows on the review pages. */
export const STATUS_BADGE: Record<BlogReviewStatus, { label: string; tone: "accent" | "success" | "danger" }> = {
  waiting: { label: "Waiting", tone: "accent" },
  update: { label: "Update waiting", tone: "accent" },
  live: { label: "Live", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};
