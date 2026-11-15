/**
 * Guards components/ui/Button.tsx: the capsule button every screen uses.
 *
 * Tailwind only keeps class names it can read whole in the source (F2), so
 * each variant and size must arrive on the element as complete, literal
 * classes: a name pieced together at runtime ships with no styling at all.
 * The other half is behaviour: a disabled or busy button must not act, since
 * Pay is one of these.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Button, { ButtonLink } from "@/components/ui/Button";

// What each variant must put on the element: its fill and its text colour.
// A filled button's hover is a solid darker shade (`-hover`), never a 90%
// tint: the tint left white text under 4.5:1, and on a phone the hover
// colour stays after a tap.
const VARIANT_CLASSES = {
  filled: ["bg-accent", "text-white", "hover:bg-accent-hover"],
  tinted: ["bg-accent/10", "text-accent-ink", "hover:bg-accent/15"],
  gray: ["bg-ink/[0.06]", "text-ink", "hover:bg-ink/10"],
  plain: ["bg-transparent", "text-accent-ink", "hover:bg-accent/10"],
  wa: ["bg-wa", "text-white", "hover:bg-wa-hover"],
  danger: ["bg-transparent", "text-danger-ink", "hover:bg-danger/10"],
  destructive: ["bg-red-600", "text-white", "hover:bg-red-700"],
} as const;

const SIZE_CLASSES = {
  sm: ["h-11", "px-4", "text-[15px]"],
  md: ["h-11", "px-5", "text-[16px]"],
  lg: ["h-[52px]", "px-6", "text-[17px]"],
} as const;

type Variant = keyof typeof VARIANT_CLASSES;
type Size = keyof typeof SIZE_CLASSES;

describe("how a button looks", () => {
  it.each(Object.keys(VARIANT_CLASSES) as Variant[])("the %s variant carries its full class names", (variant) => {
    render(<Button variant={variant}>Pay</Button>);

    expect(screen.getByRole("button", { name: "Pay" })).toHaveClass(...VARIANT_CLASSES[variant]);
  });

  it.each(Object.keys(SIZE_CLASSES) as Size[])("the %s size carries its full class names", (size) => {
    render(<Button size={size}>Pay</Button>);

    expect(screen.getByRole("button", { name: "Pay" })).toHaveClass(...SIZE_CLASSES[size]);
  });

  it("is the filled, large button unless told otherwise", () => {
    render(<Button>Pay</Button>);

    expect(screen.getByRole("button", { name: "Pay" })).toHaveClass(...VARIANT_CLASSES.filled, ...SIZE_CLASSES.lg);
  });

  it("never carries a half-built class name", () => {
    render(
      <>
        {(Object.keys(VARIANT_CLASSES) as Variant[]).map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </>,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button.className).not.toMatch(/undefined|null|false|\[object/);
    }
  });

  it("is tall enough to tap at every size (44px or more)", () => {
    // The heights are fixed classes; this pins them to the tap-target rule.
    // The small size used to be 36px (h-9).
    expect(SIZE_CLASSES.sm).toContain("h-11");
    expect(SIZE_CLASSES.md).toContain("h-11");
    expect(SIZE_CLASSES.lg).toContain("h-[52px]");
  });

  it("keeps a filled button's words readable under the finger (no 90% tints)", () => {
    render(
      <>
        {(Object.keys(VARIANT_CLASSES) as Variant[]).map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </>,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button.className).not.toMatch(/hover:bg-[a-z0-9-]+\/90/);
    }
  });

  it("stretches across its container only when asked", () => {
    render(
      <>
        <Button full>Wide</Button>
        <Button>Narrow</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Wide" })).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "Narrow" })).not.toHaveClass("w-full");
  });

  it("keeps extra classes the screen adds", () => {
    render(<Button className="mt-5">Pay</Button>);

    expect(screen.getByRole("button", { name: "Pay" })).toHaveClass("mt-5", "bg-accent");
  });
});

describe("what a button does", () => {
  it("acts when tapped", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Pay ₦3,304</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Pay ₦3,304" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        No Codes Available
      </Button>,
    );
    const button = screen.getByRole("button", { name: "No Codes Available" });

    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("cannot be tapped again while it is busy, and says so to screen readers", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Processing...
      </Button>,
    );
    // The spinner adds "Loading" to the button's spoken name.
    const button = screen.getByRole("button", { name: /Processing/ });

    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAccessibleName("Loading Processing...");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is not marked busy when it isn't", () => {
    render(<Button>Pay</Button>);

    expect(screen.getByRole("button", { name: "Pay" })).not.toHaveAttribute("aria-busy");
  });

  it("does not submit a form unless it is made a submit button", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Cancel</Button>
        <Button type="submit">Pay</Button>
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Pay" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("a button that is a link", () => {
  it("goes to a page on the site", () => {
    render(<ButtonLink href="/hostels">Find your hostel</ButtonLink>);

    const link = screen.getByRole("link", { name: "Find your hostel" });
    expect(link).toHaveAttribute("href", "/hostels");
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveClass(...VARIANT_CLASSES.filled);
  });

  it("opens another site in a new tab without handing it our window", () => {
    render(
      <ButtonLink href="https://wa.me/2348012345678" external variant="wa" size="md">
        Chat on WhatsApp
      </ButtonLink>,
    );

    const link = screen.getByRole("link", { name: "Chat on WhatsApp" });
    expect(link).toHaveAttribute("href", "https://wa.me/2348012345678");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass(...VARIANT_CLASSES.wa, ...SIZE_CLASSES.md);
  });

  it("asks the server for the page again when it is a Try again link", () => {
    // `reload` is for server-written pages (the blog list): a plain link, in
    // this tab, so the browser fetches the page afresh.
    render(
      <ButtonLink href="/blog" reload variant="tinted" size="md">
        Try again
      </ButtonLink>,
    );

    const link = screen.getByRole("link", { name: "Try again" });
    expect(link).toHaveAttribute("href", "/blog");
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveClass(...VARIANT_CLASSES.tinted, ...SIZE_CLASSES.md);
  });
});
