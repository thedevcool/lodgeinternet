"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";

/** FAQ-style accordion. Items open independently; height animates smoothly. */
export type AccordionItem = { question: string; answer: ReactNode };

export default function Accordion({ items, defaultOpen = 0 }: { items: AccordionItem[]; defaultOpen?: number | null }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set(defaultOpen === null ? [] : [defaultOpen]));
  const baseId = useId();

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        const panelId = `${baseId}-panel-${i}`;
        return (
          <div key={item.question} className="overflow-hidden rounded-card bg-surface shadow-card">
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="ui-headline text-ink">{item.question}</span>
              <ChevronDown
                className={cx("h-5 w-5 shrink-0 text-ink-3 transition-transform duration-300 ease-ios", isOpen && "rotate-180")}
              />
            </button>
            {/* grid-rows trick: animates from 0 to the content's natural height */}
            <div
              id={panelId}
              role="region"
              className={cx(
                "grid transition-[grid-template-rows] duration-300 ease-ios",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="ui-callout border-t border-hairline px-5 pb-5 pt-4 leading-relaxed text-ink-2">{item.answer}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
