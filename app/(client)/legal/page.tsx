import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { LEGAL_LINKS, fetchLegalList, formatLegalDate } from "@/lib/legal";

/** /legal — every legal page in one place. */
export const revalidate = 600;
export const metadata: Metadata = { title: "Legal · Lodge Internet" };

export default async function LegalIndex() {
  const documents = await fetchLegalList();
  // If the API is unreachable, still list the pages (each loads on its own).
  const items = documents.length
    ? documents
    : LEGAL_LINKS.map((link) => ({ ...link, summary: "", updated: "" }));

  return (
    <Container className="pb-16">
      <PageHeader title="Legal" subtitle="How Lodge Internet works with you, your money and your data." />
      <ul className="mt-6 max-w-3xl divide-y divide-hairline overflow-hidden rounded-card bg-surface shadow-card">
        {items.map((doc) => (
          <li key={doc.slug}>
            <Link href={`/legal/${doc.slug}`} className="flex items-center gap-3 px-5 py-4 hover:bg-ink/[0.03]">
              <div className="min-w-0 flex-1">
                <p className="ui-headline text-ink">{doc.title}</p>
                {doc.summary && <p className="ui-subhead mt-0.5 text-ink-2">{doc.summary}</p>}
                {doc.updated && <p className="ui-footnote mt-1 text-ink-3">Updated {formatLegalDate(doc.updated)}</p>}
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
