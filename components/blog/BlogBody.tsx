import Link from "next/link";
import type { ReactNode } from "react";
import type { BlogBlock } from "@/lib/blog";
import BlogHostels from "./BlogHostels";

/**
 * A blog post's body, drawn from the blocks the backend sends
 * (backend/app/blog). No HTML ever comes from the API: text is text, and the
 * few inline marks a post may use are turned into elements here.
 *
 *   **bold**   *italic*   `code`   [text](/our/page or https://lodgeinternet.com/…)
 *
 * A link to anywhere else shows as plain text (the backend's checks refuse
 * such links before a post can be approved, so this is only a backstop).
 */

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
const OWN_SITE = /^https:\/\/(www\.)?lodgeinternet\.com(\/|$)/;

function Inline({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const token = match[0];
    const key = `${at}-${token.length}`;
    if (match[1]) {
      parts.push(
        // Long file paths must wrap, or the page scrolls sideways on a phone.
        <code key={key} className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-ink [overflow-wrap:anywhere]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      parts.push(
        <strong key={key} className="font-semibold text-ink">
          <Inline text={token.slice(2, -2)} />
        </strong>,
      );
    } else if (match[3]) {
      parts.push(
        <em key={key}>
          <Inline text={token.slice(1, -1)} />
        </em>,
      );
    } else {
      const label = token.slice(1, token.indexOf("]("));
      const href = token.slice(token.indexOf("](") + 2, -1);
      if (href.startsWith("/")) {
        parts.push(
          <Link key={key} href={href} className="font-medium text-accent-ink underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
            {label}
          </Link>,
        );
      } else if (OWN_SITE.test(href)) {
        parts.push(
          <a key={key} href={href} className="font-medium text-accent-ink underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
            {label}
          </a>,
        );
      } else {
        parts.push(label);
      }
    }
    last = at + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "h2":
      return <h2 className="ui-title-2 mt-10 text-ink">{<Inline text={block.text} />}</h2>;
    case "h3":
      return <h3 className="ui-headline mt-7 text-ink">{<Inline text={block.text} />}</h3>;
    case "p":
      return (
        <p className="mt-4 text-[17px] leading-[1.65] text-ink-2">
          <Inline text={block.text} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="mt-6 border-l-[3px] border-accent pl-4 text-[18px] leading-[1.6] text-ink">
          <Inline text={block.text} />
        </blockquote>
      );
    case "ul":
    case "ol": {
      const List = block.type === "ul" ? "ul" : "ol";
      return (
        <List
          className={
            block.type === "ul"
              ? "mt-4 list-disc space-y-2 pl-5 text-[17px] leading-[1.6] text-ink-2 marker:text-ink-3"
              : "mt-4 list-decimal space-y-2 pl-5 text-[17px] leading-[1.6] text-ink-2 marker:font-semibold marker:text-ink-3"
          }
        >
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              <Inline text={item} />
            </li>
          ))}
        </List>
      );
    }
    case "code":
      return (
        <pre className="mt-5 overflow-x-auto rounded-inner bg-surface-2 px-4 py-3.5 text-[13.5px] leading-[1.65] text-ink ring-1 ring-hairline">
          <code className="font-mono">{block.text}</code>
        </pre>
      );
    case "hostels":
      return <BlogHostels />;
    default:
      return null;
  }
}

export default function BlogBody({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div className="[&>*:first-child]:mt-0">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}
