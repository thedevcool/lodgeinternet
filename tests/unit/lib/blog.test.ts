/**
 * Guards lib/blog.ts: the small helpers behind the blog pages (dates,
 * reading time) and the two calls that fetch posts.
 *
 * Posts only reach readers once a superadmin approves them, and a blog that
 * can't be fetched must read as "no posts" (null), never as a crash: the
 * pages are rendered on the server for search engines.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBackend, json, type FakeBackend } from "../../helpers/backend";
import { fetchBlog, fetchBlogPost, formatBlogDate, readingMinutes, type BlogBlock } from "@/lib/blog";

/** `count` words of body text. */
function words(count: number): string {
  return Array.from({ length: count }, () => "word").join(" ");
}

describe("a post's date", () => {
  it("reads as day, month in full, year", () => {
    expect(formatBlogDate("2026-11-14")).toBe("14 November 2026");
    expect(formatBlogDate("2026-01-01")).toBe("1 January 2026");
  });

  it("is the same date whatever timezone the reader is in", () => {
    // The last day of a month is where a timezone slip would show.
    expect(formatBlogDate("2026-12-31")).toBe("31 December 2026");
    expect(formatBlogDate("2028-02-29")).toBe("29 February 2028");
  });

  it("is blank for a post that has none yet", () => {
    expect(formatBlogDate(null)).toBe("");
    expect(formatBlogDate("")).toBe("");
  });

  it("is shown as written when it is not a date", () => {
    expect(formatBlogDate("soon")).toBe("soon");
    expect(formatBlogDate("2026-13-45")).toBe("2026-13-45");
  });
});

describe("how long a post takes to read", () => {
  it("is never less than a minute", () => {
    expect(readingMinutes([])).toBe(1);
    expect(readingMinutes([{ type: "p", text: "Short." }])).toBe(1);
  });

  it("counts 220 words a minute, rounded to the nearest minute", () => {
    expect(readingMinutes([{ type: "p", text: words(220) }])).toBe(1);
    expect(readingMinutes([{ type: "p", text: words(329) }])).toBe(1);
    expect(readingMinutes([{ type: "p", text: words(330) }])).toBe(2);
    expect(readingMinutes([{ type: "p", text: words(660) }])).toBe(3);
  });

  it("counts every kind of block that holds text: headings, quotes, lists and code", () => {
    const blocks: BlogBlock[] = [
      { type: "h2", text: words(100) },
      { type: "h3", text: words(100) },
      { type: "quote", text: words(100) },
      { type: "ul", items: [words(50), words(50)] },
      { type: "ol", items: [words(100)] },
      { type: "code", lang: "bash", text: words(160) },
    ];
    // 660 words in all.
    expect(readingMinutes(blocks)).toBe(3);
  });

  it("does not count the live hostel list, which has no text of its own", () => {
    expect(readingMinutes([{ type: "hostels" }, { type: "p", text: words(440) }])).toBe(2);
  });
});

describe("fetching the blog", () => {
  let backend: FakeBackend;
  beforeEach(() => {
    backend = fakeBackend();
  });

  it("returns the sections and posts the backend sends", async () => {
    const blog = { sections: [{ key: "guides", title: "Guides" }], posts: [{ slug: "how-codes-work", title: "How codes work" }] };
    backend.on("GET /api/blog", () => json(blog));

    expect(await fetchBlog()).toEqual(blog);
  });

  it("reads as no blog when the backend refuses or can't be reached", async () => {
    backend.on("GET /api/blog", () => json({ error: "Something went wrong." }, 500));
    expect(await fetchBlog()).toBeNull();

    backend.on("GET /api/blog", () => Promise.reject(new TypeError("fetch failed")));
    expect(await fetchBlog()).toBeNull();
  });

  it("fetches one post by its slug", async () => {
    backend.on("GET /api/blog/how-codes-work", () => json({ slug: "how-codes-work", blocks: [] }));

    expect(await fetchBlogPost("how-codes-work")).toEqual({ slug: "how-codes-work", blocks: [] });
  });

  it("keeps an odd slug inside the blog's own path", async () => {
    await fetchBlogPost("../admin/settings?x=1");

    expect(backend.requests).toHaveLength(1);
    expect(backend.requests[0].url).toBe("/api/blog/..%2Fadmin%2Fsettings%3Fx%3D1");
  });

  it("reads as no post when it is missing or the backend can't be reached", async () => {
    backend.on("GET /api/blog/gone", () => json({ error: "Not found." }, 404));
    expect(await fetchBlogPost("gone")).toBeNull();

    backend.on("GET /api/blog/gone", () => Promise.reject(new TypeError("fetch failed")));
    expect(await fetchBlogPost("gone")).toBeNull();
  });
});
