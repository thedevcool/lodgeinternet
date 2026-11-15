/**
 * Guards lib/staleBuild.ts: the reload that rescues a page left open across
 * a deploy.
 *
 * After a deploy the old page's JavaScript files are gone, and the next tap
 * fails to load one. Reloading fixes that. The danger is the opposite case: a
 * real crash that reloading can't fix must not reload forever, so the reload
 * happens at most once a minute per tab.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isStaleBuildError, reloadOnce } from "@/lib/staleBuild";

describe("recognising a page left over from an old build", () => {
  it("recognises a missing JavaScript chunk", () => {
    const error = new Error("Loading chunk 4821 failed.");
    error.name = "ChunkLoadError";
    expect(isStaleBuildError(error)).toBe(true);
    expect(isStaleBuildError(new Error("Loading chunk app/(client)/page failed."))).toBe(true);
  });

  it("recognises a missing stylesheet and a failed module import", () => {
    expect(isStaleBuildError(new Error("Loading CSS chunk 12 failed."))).toBe(true);
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: /_next/x.js"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("recognises the error by its name alone", () => {
    const error = new Error("");
    error.name = "ChunkLoadError";
    expect(isStaleBuildError(error)).toBe(true);
  });

  it("does not mistake an ordinary crash for an old build", () => {
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'total')"))).toBe(false);
    expect(isStaleBuildError(new Error("Failed to fetch"))).toBe(false);
  });

  it("copes with things that are not errors at all", () => {
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
    expect(isStaleBuildError({})).toBe(false);
    expect(isStaleBuildError("something broke")).toBe(false);
  });
});

describe("reloading to pick up the new build", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
    // jsdom's real location.reload() does nothing but complain; a stand-in
    // lets the test count reloads.
    reload = vi.fn();
    vi.stubGlobal("location", { reload });
    return () => {
      vi.useRealTimers();
    };
  });

  it("reloads the first time", () => {
    expect(reloadOnce()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never loops on a real crash: a second failure within a minute does not reload again", () => {
    expect(reloadOnce()).toBe(true);

    vi.advanceTimersByTime(59_999);
    expect(reloadOnce()).toBe(false);
    expect(reloadOnce()).toBe(false);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again once a minute has passed (the next deploy)", () => {
    expect(reloadOnce()).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(reloadOnce()).toBe(true);

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("a refused reload does not push the next allowed one further away", () => {
    expect(reloadOnce()).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(reloadOnce()).toBe(false);

    // One minute after the reload that happened, not after the refusal.
    vi.advanceTimersByTime(30_000);
    expect(reloadOnce()).toBe(true);
  });

  it("still reloads when the browser blocks storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(reloadOnce()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
