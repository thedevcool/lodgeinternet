/**
 * Guards components/client/Footer.tsx: the Blog link in the site footer.
 *
 * A feature that is not live does not appear (P7): the footer asks the
 * backend whether the blog has any approved post, and only then links to it.
 * A link to an empty blog, or one that appears because the request failed,
 * would break that rule on every page of the site.
 *
 * The answer is kept for the life of the page, so each test loads a fresh
 * copy of the footer.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, fakeBackend, json, type FakeBackend } from "../../../helpers/backend";

let backend: FakeBackend;

beforeEach(() => {
  backend = fakeBackend();
  vi.resetModules();
});

async function renderFooter() {
  const { default: Footer } = await import("@/components/client/Footer");
  return render(<Footer />);
}

/** Lets the blog answer arrive and the footer redraw. */
async function blogAnswered() {
  // The footer always has a Home link; waiting on it flushes pending updates.
  await screen.findByRole("link", { name: "Home" });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const ONE_POST = { sections: [], posts: [{ slug: "how-codes-work", title: "How codes work" }] };

describe("the footer's Blog link", () => {
  it("appears when the blog has at least one post", async () => {
    backend.on("GET /api/blog", () => json(ONE_POST));

    await renderFooter();

    expect(await screen.findByRole("link", { name: "Blog" })).toHaveAttribute("href", "/blog");
  });

  it("stays hidden when the blog has no posts", async () => {
    backend.on("GET /api/blog", () => json({ sections: [], posts: [] }));

    await renderFooter();
    await blogAnswered();

    expect(screen.queryByRole("link", { name: "Blog" })).toBeNull();
  });

  it("stays hidden when the backend sends no list of posts at all", async () => {
    backend.on("GET /api/blog", () => json({}));

    await renderFooter();
    await blogAnswered();

    expect(screen.queryByRole("link", { name: "Blog" })).toBeNull();
  });

  it("stays hidden when the backend refuses", async () => {
    backend.on("GET /api/blog", () => json({ error: "Something went wrong." }, 500));

    await renderFooter();
    await blogAnswered();

    expect(screen.queryByRole("link", { name: "Blog" })).toBeNull();
  });

  it("stays hidden when the backend can't be reached", async () => {
    backend.on("GET /api/blog", () => Promise.reject(new TypeError("fetch failed")));

    await renderFooter();
    await blogAnswered();

    expect(screen.queryByRole("link", { name: "Blog" })).toBeNull();
  });

  it("is not shown before the backend has answered", async () => {
    const answer = deferred<Response>();
    backend.on("GET /api/blog", () => answer.promise);

    await renderFooter();
    expect(screen.queryByRole("link", { name: "Blog" })).toBeNull();

    answer.resolve(json(ONE_POST));
    expect(await screen.findByRole("link", { name: "Blog" })).toBeInTheDocument();
  });

  it("asks the backend once per page, however many footers are drawn", async () => {
    backend.on("GET /api/blog", () => json(ONE_POST));
    const { default: Footer } = await import("@/components/client/Footer");

    render(
      <>
        <Footer />
        <Footer />
      </>,
    );

    expect(await screen.findAllByRole("link", { name: "Blog" })).toHaveLength(2);
    expect(backend.sent("GET /api/blog")).toHaveLength(1);
    // Asked as the customer site, with no page-specific data.
    expect(backend.sent("GET /api/blog")[0].headers.get("X-Lodge-Client")).toBe("site");
  });
});

describe("the rest of the footer", () => {
  it("always links Home, Hostels, the account pages and every legal document", async () => {
    backend.on("GET /api/blog", () => json({ posts: [] }));
    const { LEGAL_LINKS } = await import("@/lib/legal");

    await renderFooter();
    await blogAnswered();

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Hostels" })).toHaveAttribute("href", "/hostels");
    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/support");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register");
    for (const link of LEGAL_LINKS) {
      expect(screen.getByRole("link", { name: link.title })).toHaveAttribute("href", `/legal/${link.slug}`);
    }
  });

  it("offers WhatsApp and Telegram only when the bot is set up", async () => {
    backend.on("GET /api/blog", () => json({ posts: [] }));
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME", "");
    vi.stubEnv("NEXT_PUBLIC_TELEGRAM_URL", "");

    const { unmount } = await renderFooter();
    await blogAnswered();
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Telegram" })).toBeNull();
    unmount();

    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "2348012345678");
    vi.stubEnv("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME", "lodgeinternetBot");
    vi.resetModules();
    await renderFooter();
    await blogAnswered();

    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/2348012345678?text=Hi%20Lodge%20Internet",
    );
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute("href", "https://t.me/lodgeinternetBot?start=footer");
  });
});
