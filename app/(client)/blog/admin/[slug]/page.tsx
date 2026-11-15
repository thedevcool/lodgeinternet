"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, PenLine, StickyNote, X } from "lucide-react";
import Container from "@/components/ui/Container";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TextField from "@/components/ui/TextField";
import { ErrorState, Skeleton } from "@/components/ui/States";
import BlogBody from "@/components/blog/BlogBody";
import BlogCover from "@/components/blog/BlogCover";
import { adminFetch } from "@/lib/apiClient";
import { AUDIENCE_LABEL, STATUS_BADGE, formatBlogDate, readingMinutes, type BlogReviewPage } from "@/lib/blog";

/**
 * /blog/admin/<slug> — one post, drawn exactly as readers will see it, with
 * the writer's note to the reviewer and the verdict buttons.
 *
 * Read · Edit: the superadmin can change the title, summary and body before
 * approving. Edits are saved as a draft on the server (never published until
 * approved) and must pass the same never-publish rules as the written post;
 * anything that breaks one is listed and approval waits until it's fixed.
 *
 * Every action sends the file's fingerprint (`contentHash`): if a deploy
 * changed the post while it was open, the backend refuses, so nothing is
 * approved unread.
 */

type Mode = "read" | "edit";

const FIELD =
  "ui-body w-full rounded-inner bg-canvas p-3 text-ink ring-1 ring-hairline focus:outline-none focus:ring-2 focus:ring-accent";

export default function BlogReviewPost({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const [post, setPost] = useState<BlogReviewPage | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [mode, setMode] = useState<Mode>("read");
  const [draft, setDraft] = useState({ title: "", summary: "", body: "" });
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const show = (page: BlogReviewPage) => {
    setPost(page);
    setDraft(page.editor);
  };

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
      const page = (await res.json()) as BlogReviewPage;
      setPost(page);
      setDraft(page.editor);
    } catch {
      setFailed("The post didn't load. Check your connection and try again.");
    }
  }, [params.slug, router]);

  useEffect(() => {
    load();
  }, [load]);

  /** One request to the review API. Returns the JSON on success, or null
   * after showing why it failed. */
  const call = async (path: string, method: string, body?: object) => {
    if (!post) return null;
    setBusy(true);
    setActionError("");
    try {
      const res = await adminFetch(`/api/admin/blog/${encodeURIComponent(post.slug)}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify({ contentHash: post.contentHash, ...body }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/blog/admin/login");
        return null;
      }
      if (!res.ok) {
        setActionError(data.error || "That didn't go through. Try again.");
        if (data.code === "BLOG_POST_CHANGED") load();
        return null;
      }
      return data;
    } catch {
      setActionError("That didn't go through. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = async () => {
    const page = await call("/draft", "PUT", draft);
    if (page) {
      show(page as BlogReviewPage);
      setMode("read");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const discardEdits = async () => {
    const page = await call("/draft", "DELETE");
    if (page) {
      show(page as BlogReviewPage);
      setMode("read");
    }
  };

  const verdict = async (action: "approve" | "reject" | "unpublish") => {
    const done = await call(`/${action}`, "POST", action === "reject" ? { note } : {});
    if (done) router.push("/blog/admin");
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
  const editsWaiting = post.edited;
  const changedSinceSaved =
    draft.title !== post.editor.title || draft.summary !== post.editor.summary || draft.body !== post.editor.body;

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
            {editsWaiting && <Badge tone="warning">Your edits, not published yet</Badge>}
            {post.published && <span className="ui-footnote text-ink-3">First published {formatBlogDate(post.published)}</span>}
          </div>
          {post.status === "update" && (
            <p className="ui-subhead mt-2 text-ink-2">
              {post.coverOnly
                ? "The words are live already. Only the cover illustration is new: readers see it once you approve."
                : "An earlier version is live. Readers keep seeing it until you approve this one."}
            </p>
          )}
          {post.draftStale && (
            <p className="ui-subhead mt-2 text-warning-ink">
              The post was rewritten after you edited it. Your edits are kept: check them against the new text in Edit.
            </p>
          )}
          {post.reviewNote && (
            <p className="ui-subhead mt-2 text-ink-2">
              Last verdict{post.reviewedBy ? ` by ${post.reviewedBy}` : ""}: {post.reviewNote}
            </p>
          )}
          {post.note && (
            <div className="mt-3 flex gap-2 rounded-inner bg-warning/10 p-3">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" />
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

        <SegmentedControl
          className="mt-6"
          ariaLabel="Read or edit the post"
          value={mode}
          onSelect={(value) => setMode(value as Mode)}
          segments={[
            { value: "read", label: "Read" },
            { value: "edit", label: "Edit" },
          ]}
        />

        {mode === "read" ? (
          /* The post, as readers will see it (with your edits, if any). */
          <article className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{post.sectionTitle}</Badge>
              <span className="ui-footnote text-ink-3">{AUDIENCE_LABEL[post.audience]}</span>
            </div>
            <h1 className="ui-title-1 mt-3 text-ink sm:ui-large-title">{post.title}</h1>
            <p className="ui-callout mt-3 text-ink-2">{post.summary}</p>
            <p className="ui-footnote mt-4 text-ink-3">Lodge Internet · {readingMinutes(post.blocks)} min read</p>
            <BlogCover svg={post.coverSvg} className="mt-6 rounded-card" />
            <div className={post.coverSvg ? "mt-8" : "mt-8 border-t border-hairline pt-6"}>
              <BlogBody blocks={post.blocks} />
            </div>
            <p className="ui-footnote mt-12 rounded-inner bg-ink/[0.04] px-4 py-3 text-ink-2">
              Last checked against the product on {formatBlogDate(post.checked)}.
            </p>
          </article>
        ) : (
          /* The editor: change the words, then save to see them as readers will. */
          <div className="mt-6 space-y-4">
            <TextField label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <div>
              <label htmlFor="edit-summary" className="ui-subhead mb-1.5 block px-1 font-medium text-ink-2">
                Summary
              </label>
              <textarea
                id="edit-summary"
                rows={3}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="edit-body" className="ui-subhead mb-1.5 block px-1 font-medium text-ink-2">
                The post
              </label>
              <textarea
                id="edit-body"
                rows={22}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className={`${FIELD} font-mono text-[15px] leading-[1.6]`}
                spellCheck
              />
              <p className="ui-footnote mt-2 px-1 text-ink-3">
                Leave a blank line between paragraphs. <span className="font-mono">## </span>heading ·{" "}
                <span className="font-mono">- </span>bullet · <span className="font-mono">**bold**</span> ·{" "}
                <span className="font-mono">[words](/blog/a-post)</span> link ·{" "}
                <span className="font-mono">{"{{hostels}}"}</span> the live hostel list.
              </p>
            </div>
            {actionError && <InlineAlert tone="danger">{actionError}</InlineAlert>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="lg" full onClick={saveEdits} disabled={busy || !changedSinceSaved}>
                <PenLine className="h-5 w-5" /> Save and preview
              </Button>
              {editsWaiting && (
                <Button variant="danger" size="lg" full onClick={discardEdits} disabled={busy}>
                  Discard my edits
                </Button>
              )}
            </div>
            <p className="ui-footnote px-1 text-ink-3">Saving doesn&apos;t publish anything. Your edits go live when you approve.</p>
          </div>
        )}

        {/* The verdict. */}
        {mode === "read" && (
          <div className="mt-8 rounded-card bg-surface p-4 shadow-card ring-1 ring-hairline">
            <p className="ui-headline text-ink">Your verdict</p>
            {post.problems.length > 0 && (
              <InlineAlert tone="danger" className="mt-3" title="This can't go live yet">
                <ul className="list-disc space-y-1 pl-4">
                  {post.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </InlineAlert>
            )}
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
                  className={`${FIELD} mt-2`}
                  placeholder="e.g. Don't mention the reminder emails yet."
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="gray" onClick={() => setRejecting(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button variant="destructive" full onClick={() => verdict("reject")} disabled={busy || !note.trim()}>
                    <X className="h-4 w-4" /> Reject with this note
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {(post.status !== "live" || editsWaiting) && (
                  <Button size="lg" full onClick={() => verdict("approve")} disabled={busy || post.problems.length > 0}>
                    <Check className="h-5 w-5" />{" "}
                    {editsWaiting
                      ? "Publish with my edits"
                      : post.coverOnly
                        ? "Approve the new cover"
                        : post.status === "update"
                          ? "Approve this update"
                          : "Approve and publish"}
                  </Button>
                )}
                {post.status !== "rejected" && post.status !== "live" && (
                  <Button variant="gray" size="lg" full onClick={() => setRejecting(true)} disabled={busy}>
                    <X className="h-5 w-5" /> Reject
                  </Button>
                )}
                {(post.status === "live" || post.status === "update") && (
                  <Button variant="danger" size="lg" full onClick={() => verdict("unpublish")} disabled={busy}>
                    Take it off the blog
                  </Button>
                )}
                {post.status === "rejected" && !editsWaiting && (
                  <p className="ui-subhead text-ink-2">
                    Rejected. Edit it here and publish, or a new version appears once the post is rewritten and deployed.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
