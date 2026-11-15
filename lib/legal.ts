import { apiUrl } from "@/lib/apiClient";

/**
 * The legal pages (Terms, Privacy, Refunds & Wallet, …). Their content lives
 * in the backend (backend/app/legal) and is fetched here on the server, so the
 * pages arrive fully written — readable by search engines and by Meta's
 * WhatsApp review, which checks the privacy page — and refreshed every 10 min.
 *
 * One document has two ways to be absent, and they are kept apart: the
 * backend says there is no such document (the page is a 404), or the backend
 * couldn't be asked (`LegalUnavailable`: the page says it didn't load and
 * offers to try again). Both used to read as "not found", so the privacy
 * policy answered 404 whenever the API hiccuped.
 */
export type LegalBlock = { type: "p"; text: string } | { type: "h"; text: string } | { type: "list"; items: string[] };
export type LegalSection = { heading: string; blocks: LegalBlock[] };
export type LegalSummary = {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  /** Only on documents with a formal version (the privacy policy). */
  effective?: string;
  version?: string;
};
export type LegalDocument = LegalSummary & { company: string; contactEmail: string; sections: LegalSection[] };

const REVALIDATE = { next: { revalidate: 600 } } as const;

export async function fetchLegalList(): Promise<LegalSummary[]> {
  try {
    const res = await fetch(apiUrl("/api/legal"), REVALIDATE);
    if (!res.ok) return [];
    return ((await res.json()).documents ?? []) as LegalSummary[];
  } catch {
    return [];
  }
}

/** The backend failed or couldn't be reached, so we don't know whether the document exists. */
export class LegalUnavailable extends Error {
  constructor(slug: string, reason: string) {
    super(`Legal document "${slug}" could not be loaded: ${reason}`);
    this.name = "LegalUnavailable";
  }
}

/**
 * One document, or null when the backend says there is none (its 404).
 * Throws `LegalUnavailable` for anything else that isn't the document.
 */
export async function fetchLegalDocument(slug: string): Promise<LegalDocument | null> {
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/legal/${encodeURIComponent(slug)}`), REVALIDATE);
  } catch {
    throw new LegalUnavailable(slug, "the API could not be reached");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new LegalUnavailable(slug, `the API answered ${res.status}`);
  return (await res.json()) as LegalDocument;
}

/** "23 October 2026" from "2026-10-23". */
export function formatLegalDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The footer's links: fixed, so the footer never waits on the API. Keep in
 * step with backend/app/legal DOCUMENTS. */
export const LEGAL_LINKS: { slug: string; title: string }[] = [
  { slug: "terms", title: "Terms of Service" },
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "refunds", title: "Refund & Wallet Policy" },
  { slug: "acceptable-use", title: "Acceptable Use" },
  { slug: "cookies", title: "Cookies & Storage" },
  { slug: "data-deletion", title: "Delete your data" },
];
