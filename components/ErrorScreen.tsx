"use client";

import { useEffect, useState } from "react";
import { isStaleBuildError, reloadOnce } from "@/lib/staleBuild";

/**
 * What a customer sees instead of Next.js's bare "Application error": a page
 * left open across a deploy reloads itself onto the new build; any other
 * crash gets a way back (try again, or home). Nothing about money is lost —
 * payments and codes live on the server.
 */
export default function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error(error);
    if (isStaleBuildError(error) && reloadOnce()) setReloading(true);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-16 text-center">
      <div className="max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {reloading ? "Updating…" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-300">
          {reloading
            ? "We just released an update. Loading the latest version."
            : "Don't worry — any payment you made is safe, and your codes are in your account."}
        </p>
        {!reloading && (
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-full bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Try again
            </button>
            <a href="/" className="rounded-full px-5 py-3 font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-white/5">
              Go home
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
