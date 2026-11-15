"use client";

/**
 * Shown in place of a legal page that couldn't be loaded: the backend failed
 * or couldn't be reached while ./page.tsx was being written (lib/legal.ts
 * throws `LegalUnavailable`). A slug that doesn't exist is a 404 instead.
 *
 * "Try again" reloads the page, because the page is written on the server:
 * the browser has to ask for it again. Nothing about this failure is saved,
 * so the reload gets a fresh attempt.
 */
import { useEffect } from "react";
import { useParams } from "next/navigation";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/States";
import { LEGAL_LINKS } from "@/lib/legal";

export default function LegalPageError({ error }: { error: Error }) {
  // The footer's fixed list knows the document's name without the backend.
  const { slug } = useParams<{ slug: string }>();
  const title = LEGAL_LINKS.find((link) => link.slug === slug)?.title ?? "Legal";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="pb-16">
      <PageHeader title={title} back={{ href: "/legal", label: "Legal" }} />
      <div className="max-w-3xl rounded-card bg-surface shadow-card">
        <ErrorState
          title="This page didn’t load"
          message="Our server didn’t answer. Give it a moment and try again."
          onRetry={() => window.location.reload()}
        />
      </div>
    </Container>
  );
}
