"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileWarning, LogOut, StickyNote } from "lucide-react";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chips";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/States";
import { adminFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import { STATUS_BADGE, type BlogReviewRow, type BlogReviewStatus } from "@/lib/blog";

/**
 * /blog/admin — the superadmin's review desk. Every post written in the
 * repository (backend/app/blog/posts) is listed with where it stands:
 * waiting for a first yes, an update to a live post, live, or rejected. Tap
 * one to read it as readers will and approve or reject it.
 */

type Tab = "waiting" | "live" | "rejected";

const TABS: { key: Tab; label: string; statuses: BlogReviewStatus[] }[] = [
  { key: "waiting", label: "To review", statuses: ["waiting", "update"] },
  { key: "live", label: "Live", statuses: ["live"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
];

type Desk = { posts: BlogReviewRow[]; broken: { slug: string; reason: string }[] };

export default function BlogReviewDesk() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [failed, setFailed] = useState("");
  const [tab, setTab] = useState<Tab>("waiting");

  const load = useCallback(async () => {
    setFailed("");
    try {
      const res = await adminFetch("/api/admin/blog");
      if (res.status === 401) {
        router.replace("/blog/admin/login");
        return;
      }
      if (res.status === 403) {
        setFailed("Only the superadmin can review blog posts.");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setDesk((await res.json()) as Desk);
    } catch {
      setFailed("The review list didn't load. Check your connection and try again.");
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // A post with unpublished edits waits for a yes, wherever it stands.
  const tabOf = (post: BlogReviewRow): Tab =>
    post.edited ? "waiting" : (TABS.find((t) => t.statuses.includes(post.status))?.key ?? "waiting");

  const counts = useMemo(() => {
    const out: Record<Tab, number> = { waiting: 0, live: 0, rejected: 0 };
    for (const post of desk?.posts ?? []) out[tabOf(post)] += 1;
    return out;
  }, [desk]);

  const shown = (desk?.posts ?? [])
    .filter((post) => tabOf(post) === tab)
    .sort((a, b) => a.sectionTitle.localeCompare(b.sectionTitle) || a.title.localeCompare(b.title));

  return (
    <Container className="pb-16">
      <PageHeader
        title="Blog review"
        subtitle="Nothing reaches the blog until you approve it. Read each post as readers will see it."
        aside={
          <Button
            variant="gray"
            size="sm"
            onClick={() => {
              logout();
              router.replace("/blog/admin/login");
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        }
      />

      {failed ? (
        <div className="mt-8">
          <ErrorState message={failed} onRetry={load} />
        </div>
      ) : !desk ? (
        <div className="mt-6">
          <ListSkeleton rows={6} />
        </div>
      ) : (
        <>
          <ChipRow className="mt-5">
            {TABS.map((t) => (
              <Chip key={t.key} selected={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label} · {counts[t.key]}
              </Chip>
            ))}
          </ChipRow>

          {desk.broken.length > 0 && (
            <div className="mt-5 rounded-card bg-danger/10 p-4">
              <p className="ui-headline flex items-center gap-2 text-danger">
                <FileWarning className="h-5 w-5" /> {desk.broken.length} post file(s) can't be read
              </p>
              <ul className="ui-footnote mt-2 space-y-1 text-ink-2">
                {desk.broken.map((b) => (
                  <li key={b.slug}>
                    {b.slug}: {b.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState
              className="mt-10"
              title={tab === "waiting" ? "Nothing waiting" : tab === "live" ? "Nothing live yet" : "Nothing rejected"}
              message={tab === "waiting" ? "Every post has been reviewed. New ones appear here after each deploy." : undefined}
            />
          ) : (
            <ul className="mt-5 max-w-3xl divide-y divide-hairline overflow-hidden rounded-card bg-surface shadow-card">
              {shown.map((post) => (
                <li key={post.slug}>
                  <Link href={`/blog/admin/${post.slug}`} className="flex items-center gap-3 px-4 py-4 hover:bg-ink/[0.03]">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_BADGE[post.status].tone}>{STATUS_BADGE[post.status].label}</Badge>
                        {post.edited && <Badge tone="warning">Edited</Badge>}
                        <span className="ui-footnote text-ink-3">{post.sectionTitle}</span>
                      </div>
                      <p className="ui-headline mt-1.5 text-ink">{post.title}</p>
                      {post.note && (
                        <p className="ui-footnote mt-1 flex items-start gap-1.5 text-warning">
                          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-2">{post.note}</span>
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Container>
  );
}
