"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, StickyNote, X } from "lucide-react";
import Container from "@/components/ui/Container";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { ErrorState, Skeleton } from "@/components/ui/States";
import BlogBody from "@/components/blog/BlogBody";
import { adminFetch } from "@/lib/apiClient";
import { AUDIENCE_LABEL, STATUS_BADGE, formatBlogDate, readingMinutes, type BlogBlock, type BlogReviewRow } from "@/lib/blog";

/**
 * /blog/admin/<slug> — one post, drawn exactly as readers will see it, with
 * the writer's note to the reviewer and the verdict buttons. Approving sends
 * the text's fingerprint (`contentHash`): if a deploy changed the post while
 * it was open, the backend refuses, so nothing is approved unread.
 */

type Review = BlogReviewRow & { blocks: BlogBlock[] };

export default function BlogReviewPost({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const [post, setPost] = useState<Review | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setFailed("");
    try {
      const res = await adminFetch(`/api/admin/blog/${encodeURIComponent(params.slug)}`);
      if (res.status === 401) {
        router.replace("/blog/admin/login");
        return;
      }
      if (res.status === 404) {
        setFailed("This post isn't in the repository any more.");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setPost((await res.json()) as Review);
    } catch {
      setFailed("The post didn't load. Check your connection and try again.");
    }
  }, [params.slug, router]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: "approve" | "reject" | "unpublish") => {
    if (!post) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await adminFetch(`/api/admin/blog/${encodeURIComponent(post.slug)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentHash: post.contentHash, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/blog/admin/login");
        return;
      }
      if (!res.ok) {
        setActionError(data.error || "That didn't go through. Try again.");
        if (data.code === "BLOG_POST_CHANGED") load();
        return;
      }
      router.push("/blog/admin");
    } catch {
      setActionError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <Container className="pb-16 pt-8">
        <ErrorState message={failed} onRetry={load} />
      </Container>
    );
  }
  if (!post) {
    return (
      <Container className="pb-16 pt-6">
        <div className="mx-auto max-w-[680px] space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Container>
    );
  }

  const badge = STATUS_BADGE[post.status];

  return (
    <Container className="pb-16">
      <div className="mx-auto max-w-[680px] pt-4">
        <Link href="/blog/admin" className="ui-subhead inline-flex min-h-[44px] items-center gap-1 text-accent-ink">
          <ChevronLeft className="h-4 w-4" />
          Blog review
        </Link>

        {/* Where it stands, and what the writer wants the reviewer to know. */}
        <div className="mt-2 rounded-card bg-surface p-4 shadow-card ring-1 ring-hairline">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {post.published && <span className="ui-footnote text-ink-3">First published {formatBlogDate(post.published)}</span>}
          </div>
          {post.status === "update" && (
            <p className="ui-subhead mt-2 text-ink-2">An earlier version is live. Readers keep seeing it until you approve this one.</p>
          )}
          {post.reviewNote && (
            <p className="ui-subhead mt-2 text-ink-2">
              Last verdict{post.reviewedBy ? ` by ${post.reviewedBy}` : ""}: {post.reviewNote}
            </p>
          )}
          {post.note && (
            <div className="mt-3 flex gap-2 rounded-inner bg-warning/10 p-3">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="ui-subhead text-ink">
                <span className="font-semibold">Note for you: </span>
                {post.note}
              </p>
            </div>
          )}
          <details className="mt-3">
            <summary className="ui-footnote cursor-pointer text-ink-3">The code this post describes ({post.covers.length})</summary>
            <ul className="ui-footnote mt-2 space-y-1 break-all font-mono text-ink-2">
              {post.covers.map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          </details>
        </div>

        {/* The post, as readers will see it. */}
        <article className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{post.sectionTitle}</Badge>
            <span className="ui-footnote text-ink-3">{AUDIENCE_LABEL[post.audience]}</span>
          </div>
          <h1 className="ui-title-1 mt-3 text-ink sm:ui-large-title">{post.title}</h1>
          <p className="ui-callout mt-3 text-ink-2">{post.summary}</p>
          <p className="ui-footnote mt-4 text-ink-3">Lodge Internet · {readingMinutes(post.blocks)} min read</p>
          <div className="mt-8 border-t border-hairline pt-6">
            <BlogBody blocks={post.blocks} />
          </div>
          <p className="ui-footnote mt-12 rounded-inner bg-ink/[0.04] px-4 py-3 text-ink-2">
            Last checked against the product on {formatBlogDate(post.checked)}.
          </p>
        </article>

        {/* The verdict. */}
        <div className="mt-8 rounded-card bg-surface p-4 shadow-card ring-1 ring-hairline">
          <p className="ui-headline text-ink">Your verdict</p>
          {actionError && (
            <InlineAlert tone="danger" className="mt-3">
              {actionError}
            </InlineAlert>
          )}
          {rejecting ? (
            <div className="mt-3">
              <label htmlFor="reject-note" className="ui-subhead text-ink-2">
                What needs to change?
              </label>
              <textarea
                id="reject-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className="ui-body mt-2 w-full rounded-inner bg-canvas p-3 text-ink ring-1 ring-hairline focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="e.g. Don't mention the reminder emails yet."
              />
              <div className="mt-3 flex gap-2">
                <Button variant="gray" onClick={() => setRejecting(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="destructive" full onClick={() => act("reject")} disabled={busy || !note.trim()}>
                  <X className="h-4 w-4" /> Reject with this note
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {post.status !== "live" && (
                <Button size="lg" full onClick={() => act("approve")} disabled={busy}>
                  <Check className="h-5 w-5" /> {post.status === "update" ? "Approve this update" : "Approve and publish"}
                </Button>
              )}
              {post.status !== "rejected" && post.status !== "live" && (
                <Button variant="gray" size="lg" full onClick={() => setRejecting(true)} disabled={busy}>
                  <X className="h-5 w-5" /> Reject
                </Button>
              )}
              {(post.status === "live" || post.status === "update") && (
                <Button variant="danger" size="lg" full onClick={() => act("unpublish")} disabled={busy}>
                  Take it off the blog
                </Button>
              )}
              {post.status === "rejected" && (
                <p className="ui-subhead text-ink-2">Rejected. A new version appears here once the post is rewritten and deployed.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
