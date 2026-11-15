/**
 * Guards lib/legal.ts: the legal pages' date format, their fetch calls and
 * the footer's fixed list of links.
 *
 * Meta's WhatsApp review and the app stores read the privacy page, so a
 * backend hiccup must give an empty list, and for one document "couldn't
 * load" (which the page shows with Try again) and never "not found": only
 * the backend's own 404 means the document doesn't exist. The footer must
 * always link the documents the stores ask for.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBackend, json, type FakeBackend } from "../../helpers/backend";
import { fetchLegalDocument, fetchLegalList, formatLegalDate, LEGAL_LINKS, LegalUnavailable } from "@/lib/legal";

describe("a legal document's date", () => {
  it("reads as day, month in full, year", () => {
    expect(formatLegalDate("2026-10-23")).toBe("23 October 2026");
    expect(formatLegalDate("2026-03-01")).toBe("1 March 2026");
  });

  it("is the same date whatever timezone the reader is in", () => {
    expect(formatLegalDate("2026-12-31")).toBe("31 December 2026");
    expect(formatLegalDate("2027-01-01")).toBe("1 January 2027");
  });

  it("is shown as written when it is not a date", () => {
    expect(formatLegalDate("October 2026")).toBe("October 2026");
    expect(formatLegalDate("")).toBe("");
  });
});

describe("the footer's legal links", () => {
  it("include the documents the stores and Meta ask for", () => {
    const slugs = LEGAL_LINKS.map((link) => link.slug);
    expect(slugs).toEqual(expect.arrayContaining(["terms", "privacy", "refunds", "data-deletion"]));
  });

  it("each have a title and a slug of their own", () => {
    const slugs = LEGAL_LINKS.map((link) => link.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const link of LEGAL_LINKS) expect(link.title.trim()).not.toBe("");
  });
});

describe("fetching the legal pages", () => {
  let backend: FakeBackend;
  beforeEach(() => {
    backend = fakeBackend();
  });

  it("lists the documents the backend sends", async () => {
    const documents = [{ slug: "privacy", title: "Privacy Policy", summary: "What we keep.", updated: "2026-10-23" }];
    backend.on("GET /api/legal", () => json({ documents }));

    expect(await fetchLegalList()).toEqual(documents);
  });

  it("lists nothing when the backend refuses, sends no list, or can't be reached", async () => {
    backend.on("GET /api/legal", () => json({ error: "Something went wrong." }, 500));
    expect(await fetchLegalList()).toEqual([]);

    backend.on("GET /api/legal", () => json({}));
    expect(await fetchLegalList()).toEqual([]);

    backend.on("GET /api/legal", () => Promise.reject(new TypeError("fetch failed")));
    expect(await fetchLegalList()).toEqual([]);
  });

  it("fetches one document by its slug", async () => {
    backend.on("GET /api/legal/privacy", () => json({ slug: "privacy", sections: [] }));

    expect(await fetchLegalDocument("privacy")).toEqual({ slug: "privacy", sections: [] });
  });

  it("reads as not found only when the backend says there is no such document", async () => {
    backend.on("GET /api/legal/gone", () => json({ error: "Not found." }, 404));

    expect(await fetchLegalDocument("gone")).toBeNull();
  });

  // Both of these used to read as "not found", so the privacy policy
  // answered 404 whenever the backend hiccuped.
  it("says it couldn't load, not that the document is missing, when the backend fails", async () => {
    backend.on("GET /api/legal/privacy", () => json({ error: "Something went wrong." }, 500));

    await expect(fetchLegalDocument("privacy")).rejects.toBeInstanceOf(LegalUnavailable);
  });

  it("says it couldn't load when the backend can't be reached", async () => {
    backend.on("GET /api/legal/privacy", () => Promise.reject(new TypeError("fetch failed")));

    await expect(fetchLegalDocument("privacy")).rejects.toBeInstanceOf(LegalUnavailable);
  });
});
