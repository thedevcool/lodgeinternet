"use client";

import ErrorScreen from "@/components/ErrorScreen";
import "./globals.css";

// A crash in the root layout itself, where app/error.tsx can't reach: it
// replaces the whole document, so it brings its own <html> and <body>.
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
