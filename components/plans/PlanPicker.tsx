"use client";

import { Check } from "lucide-react";
import SegmentedControl, { type Segment } from "@/components/ui/SegmentedControl";
import Badge from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import type { DataPlan } from "@/types";
import { planTypeLine, type PlanView } from "./checkout";
import type { PlansCheckout } from "./usePlansCheckout";

/** Plan-type tabs: 3 Devices · 5 Devices · Unlimited · TV (only what the hostel offers). */
export function PlanTypeTabs({ c }: { c: PlansCheckout }) {
  const segments: Segment[] = [];
  if (c.allow3Devices) segments.push({ value: "device-3", label: "3 Devices" });
  if (c.allow5Devices) segments.push({ value: "device-5", label: "5 Devices" });
  if (c.allowUnlimited) segments.push({ value: "unlimited", label: "Unlimited" });
  if (c.allowTv) segments.push({ value: "tv", label: "TV" });
  if (segments.length < 2) return null;

  const value = c.planView === "device" ? `device-${c.selectedDeviceCount}` : c.planView;
  const onSelect = (v: string) => {
    if (v === "device-3") c.selectTab("device", 3);
    else if (v === "device-5") c.selectTab("device", 5);
    else c.selectTab(v as PlanView);
  };

  return <SegmentedControl ariaLabel="Plan type" segments={segments} value={value} onSelect={onSelect} />;
}

/** The plans for the current tab, as a single-choice list of cards. */
export function PlanList({ c }: { c: PlansCheckout }) {
  return (
    <div role="radiogroup" aria-label="Plans" className="ui-stagger grid gap-3">
      {c.displayPlans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          selected={c.selectedPlanId === plan.id}
          stock={c.planStock(plan)}
          onSelect={() => c.setSelectedPlanId(plan.id)}
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  stock,
  onSelect,
}: {
  plan: DataPlan;
  selected: boolean;
  stock: { isAvailable: boolean; hasAvailabilityData: boolean; codeCount: number };
  onSelect: () => void;
}) {
  const { isAvailable, hasAvailabilityData, codeCount } = stock;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!isAvailable}
      // Same guard as before: an unavailable plan can't be selected.
      onClick={() => isAvailable && onSelect()}
      className={cx(
        "relative flex w-full items-center gap-3.5 rounded-card bg-surface p-4 text-left shadow-card transition duration-200 ease-ios sm:p-5",
        selected ? "ring-2 ring-accent" : "ring-1 ring-transparent hover:ring-hairline",
        isAvailable ? "active:scale-[0.985]" : "cursor-not-allowed opacity-50",
      )}
    >
      {/* iOS radio indicator */}
      <span
        aria-hidden
        className={cx(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200",
          selected ? "bg-accent text-white" : "ring-[1.5px] ring-inset ring-ink/25",
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="ui-headline block truncate text-ink">{plan.name}</span>
        <span className="ui-footnote mt-0.5 block text-ink-2">{planTypeLine(plan)}</span>
        {/* Stock — only when the server told us the count (never while loading). */}
        {hasAvailabilityData && (
          <span className="mt-2 block">
            {codeCount === 0 ? (
              <Badge tone="danger">Sold out</Badge>
            ) : codeCount === 1 ? (
              <Badge tone="danger">Last one left</Badge>
            ) : codeCount <= 5 ? (
              <Badge tone="warning">Only {codeCount} left</Badge>
            ) : null}
          </span>
        )}
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-[22px] font-bold tabular-nums tracking-[-0.02em] text-ink">
          ₦{plan.price.toLocaleString()}
        </span>
      </span>
    </button>
  );
}

export function PlanListSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy aria-label={label}>
      <div className="grid gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 rounded-card bg-surface p-5 shadow-card">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <p className="ui-footnote mt-3 text-center text-ink-2">{label}</p>
    </div>
  );
}
