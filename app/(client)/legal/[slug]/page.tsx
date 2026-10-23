import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { cx } from "@/components/ui/cx";
import { LEGAL_LINKS, fetchLegalDocument, formatLegalDate } from "@/lib/legal";

/** /legal/<slug> — one legal page, written on the server from the backend's copy. */
export const revalidate = 600;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const doc = await fetchLegalDocument(params.slug);
  return doc ? { title: `${doc.title} · Lodge Internet`, description: doc.summary } : { title: "Lodge Internet" };
}

export default async function LegalPage({ params }: { params: { slug: string } }) {
  const doc = await fetchLegalDocument(params.slug);
  if (!doc) notFound();

  return (
    <Container className="pb-16">
      <PageHeader
        title={doc.title}
        subtitle={`Last updated ${formatLegalDate(doc.updated)}`}
        back={{ href: "/legal", label: "Legal" }}
      />

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_240px]">
        <article className="max-w-3xl">
          {doc.sections.map((section) => (
            <section key={section.heading} className="mt-8 first:mt-0">
              <h2 className="ui-title-3 text-ink">{section.heading}</h2>
              {section.blocks.map((block, i) =>
                block.type === "p" ? (
                  <p key={i} className="ui-body mt-3 leading-relaxed text-ink-2">
                    {block.text}
                  </p>
                ) : (
                  <ul key={i} className="ui-body mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-2">
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
        </article>

        <nav aria-label="Legal pages" className="lg:sticky lg:top-24 lg:self-start">
          <p className="ui-footnote font-semibold uppercase tracking-[0.04em] text-ink-2">Legal</p>
          <ul className="mt-3 space-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.slug}>
                <Link
                  href={`/legal/${link.slug}`}
                  className={cx(
                    "ui-subhead hover:text-ink",
                    link.slug === doc.slug ? "font-semibold text-ink" : "text-ink-2",
                  )}
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Container>
  );
}
