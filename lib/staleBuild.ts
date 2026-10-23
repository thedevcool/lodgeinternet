/**
 * After a deploy, a page opened before it still points at the old build's
 * JavaScript files, which the new deploy removed: the next navigation fails to
 * load one and Next.js shows its bare "Application error". Reloading picks up
 * the new build. Once per tab per minute, so a genuine crash can't loop.
 */
const KEY = "lodge:stale-build-reload";

export function isStaleBuildError(error: unknown): boolean {
  const text = `${(error as Error)?.name ?? ""} ${(error as Error)?.message ?? ""}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    text,
  );
}

/** Reload once to get the new build. False if we already did that just now. */
export function reloadOnce(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage blocked: still reload; the browser's own reload guard is enough
  }
  window.location.reload();
  return true;
}
