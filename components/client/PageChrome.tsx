"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Lets a page tell the shared nav bar what to show:
 *   - title: appears in the bar once the page's large title scrolls away
 *   - back:  a back chevron (mobile) instead of the brand
 * PageHeader registers both automatically; most pages never call this.
 */
export type BackLink = { href: string; label?: string };
type Chrome = { title?: string; back?: BackLink };

type Ctx = {
  chrome: Chrome;
  setChrome: (c: Chrome) => void;
  largeTitleHidden: boolean;
  setLargeTitleHidden: (hidden: boolean) => void;
};

const PageChromeContext = createContext<Ctx | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<Chrome>({});
  const [largeTitleHidden, setLargeTitleHidden] = useState(false);
  const value = useMemo(
    () => ({ chrome, setChrome, largeTitleHidden, setLargeTitleHidden }),
    [chrome, largeTitleHidden],
  );
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

export function useChromeState() {
  const ctx = useContext(PageChromeContext);
  if (!ctx) throw new Error("useChromeState must be used inside PageChromeProvider");
  return ctx;
}

/** Register this page's nav-bar title / back link; cleared when the page unmounts. */
export function usePageChrome(title?: string, back?: BackLink) {
  const ctx = useContext(PageChromeContext);
  const setChrome = ctx?.setChrome;
  const setLargeTitleHidden = ctx?.setLargeTitleHidden;
  const backHref = back?.href;
  const backLabel = back?.label;

  useEffect(() => {
    if (!setChrome) return;
    setChrome({ title, back: backHref ? { href: backHref, label: backLabel } : undefined });
    return () => {
      setChrome({});
      setLargeTitleHidden?.(false);
    };
  }, [setChrome, setLargeTitleHidden, title, backHref, backLabel]);
}
