/**
 * Guards components/blog/BlogBody.tsx: how a blog post's body is drawn.
 *
 * A post arrives from the backend as blocks of plain text with a few inline
 * marks (**bold**, *italic*, `code`, [text](link)). Two promises matter:
 *  - text is only ever text. Nothing a post contains may become live HTML on
 *    the page, whatever it looks like.
 *  - a link may only lead to our own site. The backend refuses other links
 *    before a post is approved; this component is the backstop and shows
 *    such a link as plain words.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BlogBody from "@/components/blog/BlogBody";
import type { BlogBlock } from "@/lib/blog";

// The live hostel list fetches the hostel directory; it has its own data and
// is not what these tests are about.
vi.mock("@/components/blog/BlogHostels", () => ({
  default: () => <div data-testid="live-hostel-list" />,
}));

function renderBody(blocks: BlogBlock[]) {
  return render(<BlogBody blocks={blocks} />);
}

/** One paragraph holding `text`, returned as its element. */
function paragraph(text: string): HTMLElement {
  const { container } = renderBody([{ type: "p", text }]);
  return container.querySelector("p")!;
}

describe("the kinds of block in a post", () => {
  it("draws a section heading and a sub-heading", () => {
    renderBody([
      { type: "h2", text: "How a code reaches you" },
      { type: "h3", text: "If it is slow" },
    ]);

    expect(screen.getByRole("heading", { level: 2, name: "How a code reaches you" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "If it is slow" })).toBeInTheDocument();
  });

  it("draws a paragraph", () => {
    const p = paragraph("Pay once and your code shows on this page.");

    expect(p).toHaveTextContent("Pay once and your code shows on this page.");
  });

  it("draws a quote", () => {
    const { container } = renderBody([{ type: "quote", text: "Keep the page open until your code shows." }]);

    expect(container.querySelector("blockquote")).toHaveTextContent("Keep the page open until your code shows.");
  });

  it("draws a bulleted list with every item", () => {
    const { container } = renderBody([{ type: "ul", items: ["Pick a plan", "Pay", "Copy your code"] }]);

    const list = container.querySelector("ul")!;
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Pick a plan", "Pay", "Copy your code"]);
    expect(container.querySelector("ol")).toBeNull();
  });

  it("draws a numbered list with every item, in order", () => {
    const { container } = renderBody([{ type: "ol", items: ["Open Wi-Fi settings", "Join the hostel network", "Enter the code"] }]);

    const list = container.querySelector("ol")!;
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Open Wi-Fi settings",
      "Join the hostel network",
      "Enter the code",
    ]);
    expect(container.querySelector("ul")).toBeNull();
  });

  it("draws a code sample exactly as written, marks and all", () => {
    const sample = "curl https://api.lodgeinternet.com/health\n# **not bold** and [not a link](/x)";
    const { container } = renderBody([{ type: "code", lang: "bash", text: sample }]);

    const code = container.querySelector("pre code")!;
    expect(code.textContent).toBe(sample);
    expect(container.querySelector("pre strong")).toBeNull();
    expect(container.querySelector("pre a")).toBeNull();
  });

  it("puts the live hostel list where a post asks for it", () => {
    renderBody([{ type: "hostels" }]);

    expect(screen.getByTestId("live-hostel-list")).toBeInTheDocument();
  });

  it("draws the blocks in the order the post has them", () => {
    const { container } = renderBody([
      { type: "h2", text: "First" },
      { type: "p", text: "Second" },
      { type: "ul", items: ["Third"] },
      { type: "quote", text: "Fourth" },
    ]);

    const body = container.firstElementChild!;
    expect(Array.from(body.children).map((el) => el.tagName)).toEqual(["H2", "P", "UL", "BLOCKQUOTE"]);
  });

  it("skips a kind of block it does not know, rather than breaking the page", () => {
    const fromANewerBackend = { type: "video", url: "https://example.com/v.mp4" } as unknown as BlogBlock;
    const { container } = renderBody([fromANewerBackend, { type: "p", text: "Still here." }]);

    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container).toHaveTextContent("Still here.");
  });

  it("draws nothing for a post with no blocks", () => {
    const { container } = renderBody([]);

    expect(container.firstElementChild).toBeEmptyDOMElement();
  });
});

describe("marks inside a line of text", () => {
  it("draws **bold**", () => {
    const p = paragraph("Codes are **single use** only.");

    expect(p.querySelector("strong")).toHaveTextContent("single use");
    expect(p).toHaveTextContent("Codes are single use only.");
  });

  it("draws *italic*", () => {
    const p = paragraph("It is *usually* instant.");

    expect(p.querySelector("em")).toHaveTextContent("usually");
    expect(p).toHaveTextContent("It is usually instant.");
  });

  it("draws `code`, leaving any marks inside it alone", () => {
    const p = paragraph("Run `make **test**` first.");

    expect(p.querySelector("code")!.textContent).toBe("make **test**");
    expect(p.querySelector("strong")).toBeNull();
  });

  it("draws code and a link inside bold", () => {
    const p = paragraph("**Enter `LODGE-1234` on your [Account](/dashboard) page.**");

    const strong = p.querySelector("strong")!;
    expect(strong).toHaveTextContent("Enter LODGE-1234 on your Account page.");
    expect(strong.querySelector("code")).toHaveTextContent("LODGE-1234");
    expect(strong.querySelector("a")).toHaveAttribute("href", "/dashboard");
  });

  // Bold used to refuse any asterisk inside it, so this line was cut up as
  // two italics with the outer asterisks left showing.
  it("draws italic inside bold", () => {
    const p = paragraph("**Keep the page *open* until it shows.**");

    const strong = p.querySelector("strong")!;
    expect(strong).toHaveTextContent("Keep the page open until it shows.");
    expect(strong.querySelector("em")).toHaveTextContent("open");
  });

  it("draws several marks in one line, with the plain text between them kept", () => {
    const p = paragraph("Pay **₦3,304**, wait *a moment*, then enter `LODGE-1234`.");

    expect(p).toHaveTextContent("Pay ₦3,304, wait a moment, then enter LODGE-1234.");
    expect(p.querySelector("strong")).toHaveTextContent("₦3,304");
    expect(p.querySelector("em")).toHaveTextContent("a moment");
    expect(p.querySelector("code")).toHaveTextContent("LODGE-1234");
  });

  it("draws marks in headings, quotes and list items too", () => {
    const { container } = renderBody([
      { type: "h2", text: "The **new** wallet" },
      { type: "quote", text: "It *just* works." },
      { type: "ul", items: ["Open your [Account](/dashboard)"] },
    ]);

    expect(container.querySelector("h2 strong")).toHaveTextContent("new");
    expect(container.querySelector("blockquote em")).toHaveTextContent("just");
    expect(container.querySelector("li a")).toHaveAttribute("href", "/dashboard");
  });

  it("leaves a lone asterisk or a sum alone", () => {
    const p = paragraph("5 * 3 is 15, and * marks a footnote.");

    expect(p.querySelector("em")).toBeNull();
    expect(p).toHaveTextContent("5 * 3 is 15, and * marks a footnote.");
  });
});

describe("links in a post", () => {
  it("draws a link to one of our own pages as a link", () => {
    const p = paragraph("See [every hostel we serve](/hostels) for yours.");

    const link = within(p).getByRole("link", { name: "every hostel we serve" });
    expect(link).toHaveAttribute("href", "/hostels");
  });

  it("draws a full link to lodgeinternet.com as a link", () => {
    const p = paragraph("Read [the refund policy](https://lodgeinternet.com/legal/refunds) and [home](https://www.lodgeinternet.com).");

    expect(within(p).getByRole("link", { name: "the refund policy" })).toHaveAttribute(
      "href",
      "https://lodgeinternet.com/legal/refunds",
    );
    expect(within(p).getByRole("link", { name: "home" })).toHaveAttribute("href", "https://www.lodgeinternet.com");
  });

  it("shows a link to another site as plain words", () => {
    const p = paragraph("Pay at [this cheaper site](https://evil.example/pay) today.");

    expect(p.querySelector("a")).toBeNull();
    expect(p).toHaveTextContent("Pay at this cheaper site today.");
    expect(p.innerHTML).not.toContain("evil.example");
  });

  it("is not fooled by an address that only starts like ours", () => {
    for (const href of [
      "https://lodgeinternet.com.evil.example/pay",
      "https://lodgeinternet.community/pay",
      "http://lodgeinternet.com/pay",
      "https://evil.example/https://lodgeinternet.com/",
      "https://lodgeinternet.com@evil.example/",
    ]) {
      const p = paragraph(`Go [here](${href}) now.`);
      expect(p.querySelector("a"), href).toBeNull();
      expect(p).toHaveTextContent("Go here now.");
    }
  });

  it("shows a link that would run a script, or open mail or a file, as plain words", () => {
    for (const href of ["javascript:alert(document.cookie)", "data:text/html,<script>alert(1)</script>", "mailto:someone@example.com"]) {
      const p = paragraph(`Tap [here](${href}) now.`);
      expect(p.querySelector("a"), href).toBeNull();
    }
  });

  // "//evil.example/pay" starts with "/", so it was once drawn as one of our
  // own pages, though a browser reads it as another site. So does "/\host".
  it.each(["//evil.example/pay", "/\\evil.example/pay"])("shows a link to another site written as %s as plain words", (href) => {
    const p = paragraph(`Pay at [this cheaper site](${href}) today.`);

    expect(p.querySelector("a")).toBeNull();
    expect(p).toHaveTextContent("Pay at this cheaper site today.");
  });
});

describe("text that looks like HTML", () => {
  it("is shown as text, never run or drawn as HTML", () => {
    const nasty = '<script>window.hacked = true</script><img src=x onerror="window.hacked = true"> & <b>bold?</b>';
    const { container } = renderBody([
      { type: "h2", text: nasty },
      { type: "p", text: nasty },
      { type: "quote", text: nasty },
      { type: "ul", items: [nasty] },
      { type: "ol", items: [nasty] },
      { type: "code", lang: "html", text: nasty },
    ]);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
    // Every block shows the characters themselves.
    for (const selector of ["h2", "p", "blockquote", "ul li", "ol li", "pre code"]) {
      expect(container.querySelector(selector)!.textContent, selector).toBe(nasty);
    }
  });

  it("is shown as text inside bold, italic, code and a link's words too", () => {
    const p = paragraph("**<script>a()</script>** *<i>b</i>* `<img src=x>` [<u>c</u>](/hostels)");

    expect(p.querySelector("script")).toBeNull();
    expect(p.querySelector("i")).toBeNull();
    expect(p.querySelector("img")).toBeNull();
    expect(p.querySelector("u")).toBeNull();
    expect(p.querySelector("strong")!.textContent).toBe("<script>a()</script>");
    expect(p.querySelector("a")!.textContent).toBe("<u>c</u>");
  });

  it("cannot break out of a link's address", () => {
    const p = paragraph('See [plans](/hostels"onmouseover="alert(1)) here.');

    const link = p.querySelector("a")!;
    expect(link.getAttribute("onmouseover")).toBeNull();
    expect(link.getAttribute("href")).toBe('/hostels"onmouseover="alert(1');
  });
});
