import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { Chip, ChipRow } from "@/components/ui/Chips";
import { EmptyState } from "@/components/ui/States";
import { AUDIENCE_LABEL, fetchBlog, formatBlogDate, type BlogSummary } from "@/lib/blog";

/**
 * /blog — every approved post, newest first, filtered by section
 * (/blog?section=guides). Written on the server so search engines read it.
 * Posts appear here only after a superadmin approves them (/blog/admin).
 */
export const revalidate = 60;
export const metadata: Metadata = {
  title: "Blog · Lodge Internet",
  description: "How Lodge Internet works, how to get the most from it, and what we've built along the way.",
};

function PostCard({ post, lead }: { post: BlogSummary; lead?: boolean }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block rounded-card bg-surface p-5 shadow-card ring-1 ring-hairline transition-colors hover:bg-surface-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{post.sectionTitle}</Badge>
        <span className="ui-footnote text-ink-3">{formatBlogDate(post.published)}</span>
      </div>
      <h2 className={lead ? "ui-title-1 mt-3 text-ink" : "ui-title-3 mt-3 text-ink"}>{post.title}</h2>
      <p className="ui-subhead mt-2 text-ink-2">{post.summary}</p>
      <p className="ui-footnote mt-3 text-ink-3">{AUDIENCE_LABEL[post.audience]}</p>
    </Link>
  );
}

export default async function BlogHome({ searchParams }: { searchParams: { section?: string } }) {
  const blog = await fetchBlog();
  const sections = (blog?.sections ?? []).filter((s) => blog?.posts.some((p) => p.section === s.key));
  const chosen = sections.some((s) => s.key === searchParams.section) ? searchParams.section : undefined;
  const posts = (blog?.posts ?? []).filter((p) => !chosen || p.section === chosen);
  const [lead, ...rest] = posts;

  return (
    <Container className="pb-16">
      <PageHeader title="Blog" subtitle="How Lodge Internet works, how to get the most from it, and what we've built along the way." />

      {sections.length > 1 && (
        <ChipRow className="mt-5">
          <Chip href="/blog" selected={!chosen}>
            All
          </Chip>
          {sections.map((section) => (
            <Chip key={section.key} href={`/blog?section=${section.key}`} selected={chosen === section.key}>
              {section.title}
            </Chip>
          ))}
        </ChipRow>
      )}

      {!blog ? (
        <EmptyState
          className="mt-10"
          icon={<Newspaper />}
          title="The blog didn't load"
          message="Our server didn't answer. Give it a minute and refresh the page."
        />
      ) : !lead ? (
        <EmptyState className="mt-10" icon={<Newspaper />} title="Nothing here yet" message="New posts land here as we publish them." />
      ) : (
        <div className="mt-6 max-w-3xl space-y-4">
          <PostCard post={lead} lead />
          {rest.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </Container>
  );
}
