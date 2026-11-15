/**
 * Guards components/ui/Badge.tsx: the small status pill ("Active", "Sold
 * out", "Waiting").
 *
 * The tone is the meaning (green for good, red for a problem), so each tone
 * must reach the element as whole class names Tailwind can keep (F2); a tone
 * built at runtime would show every status in the same unstyled grey.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Badge from "@/components/ui/Badge";

// A tone's words are written in its `-ink` colour, which is dark enough to
// read on the tone's own 10% tint; the dot is the fill colour.
const TONE_CLASSES = {
  neutral: { pill: ["bg-ink/[0.06]", "text-ink-2"], dot: "bg-ink-3" },
  accent: { pill: ["bg-accent/10", "text-accent-ink"], dot: "bg-accent-ink" },
  success: { pill: ["bg-success/10", "text-success-ink"], dot: "bg-success" },
  warning: { pill: ["bg-warning/10", "text-warning-ink"], dot: "bg-warning" },
  danger: { pill: ["bg-danger/10", "text-danger-ink"], dot: "bg-danger" },
  wa: { pill: ["bg-wa/10", "text-wa-ink"], dot: "bg-wa-ink" },
} as const;

type Tone = keyof typeof TONE_CLASSES;

describe("a status badge", () => {
  it("shows its words", () => {
    render(<Badge>Active</Badge>);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it.each(Object.keys(TONE_CLASSES) as Tone[])("the %s tone carries its full class names", (tone) => {
    render(
      <Badge tone={tone} dot>
        Status
      </Badge>,
    );
    const pill = screen.getByText("Status");

    expect(pill).toHaveClass(...TONE_CLASSES[tone].pill);
    expect(pill.querySelector("span")).toHaveClass(TONE_CLASSES[tone].dot, "rounded-full");
  });

  it("is neutral unless given a tone", () => {
    render(<Badge>Draft</Badge>);

    expect(screen.getByText("Draft")).toHaveClass(...TONE_CLASSES.neutral.pill);
  });

  it("has a dot only when asked for one", () => {
    render(
      <>
        <Badge tone="success" dot>
          Active
        </Badge>
        <Badge tone="danger">Sold out</Badge>
      </>,
    );

    expect(screen.getByText("Active").querySelector("span")).not.toBeNull();
    expect(screen.getByText("Sold out").querySelector("span")).toBeNull();
  });

  it("stays on one line and keeps extra classes the screen adds", () => {
    render(
      <Badge tone="accent" className="ml-2">
        Update waiting
      </Badge>,
    );

    expect(screen.getByText("Update waiting")).toHaveClass("whitespace-nowrap", "ml-2", "bg-accent/10");
  });
});
