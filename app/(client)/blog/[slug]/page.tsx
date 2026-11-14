import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Container from "@/components/ui/Container";
import Badge from "@/components/ui/Badge";
import BlogBody from "@/components/blog/BlogBody";
import { AUDIENCE_LABEL, fetchBlog, fetchBlogPost, formatBlogDate, readingMinutes } from "@/lib/blog";

/**
 * /blog/<slug> — one approved post, written on the server. Shows when the
 * post was last checked against the product, so old information looks old.
 */
export const revalidate = 60;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await fetchBlogPost(params.slug);
  if (!post) return { title: "Blog · Lodge Internet" };
  return {
    title: `${post.title} · Lodge Internet`,
    description: post.summary,
    openGraph: { title: post.title, description: post.summary, type: "article", publishedTime: post.published ?? undefined },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const [post, blog] = await Promise.all([fetchBlogPost(params.slug), fetchBlog()]);
  if (!post) notFound();

  const more = (blog?.posts ?? []).filter((p) => p.section === post.section && p.slug !== post.slug).slice(0, 3);
  const updated = post.updated && post.updated !== post.published ? post.updated : null;

  return (
    <Container className="pb-16">
      <article className="mx-auto max-w-[680px] pt-4">
        <Link href="/blog" className="ui-subhead inline-flex min-h-[44px] items-center gap-1 text-accent-ink">
          <ChevronLeft className="h-4 w-4" />
          Blog
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={`/blog?section=${post.section}`}>
            <Badge tone="accent">{post.sectionTitle}</Badge>
          </Link>
          <span className="ui-footnote text-ink-3">{AUDIENCE_LABEL[post.audience]}</span>
        </div>
        <h1 className="ui-title-1 mt-3 text-ink sm:ui-large-title">{post.title}</h1>
        <p className="ui-callout mt-3 text-ink-2">{post.summary}</p>
        <p className="ui-footnote mt-4 text-ink-3">
          Lodge Internet · {formatBlogDate(post.published)} · {readingMinutes(post.blocks)} min read
        </p>

        <div className="mt-8 border-t border-hairline pt-6">
          <BlogBody blocks={post.blocks} />
        </div>

        <p className="ui-footnote mt-12 rounded-inner bg-ink/[0.04] px-4 py-3 text-ink-2">
          Last checked against the product on {formatBlogDate(post.checked)}.
          {updated && <> Updated {formatBlogDate(updated)}.</>}
        </p>
      </article>

      {more.length > 0 && (
        <section className="mx-auto mt-12 max-w-[680px]">
          <p className="ui-footnote font-semibold uppercase tracking-[0.04em] text-ink-3">More in {post.sectionTitle}</p>
          <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-card bg-surface shadow-card">
            {more.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}`} className="block px-5 py-4 hover:bg-ink/[0.03]">
                  <p className="ui-headline text-ink">{p.title}</p>
                  <p className="ui-subhead mt-0.5 line-clamp-2 text-ink-2">{p.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
