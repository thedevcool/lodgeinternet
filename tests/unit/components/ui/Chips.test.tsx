/**
 * Guards components/ui/Chips.tsx: the row of filter chips (collages on the
 * hostels page, sections on the blog).
 *
 * A chip is either a toggle or a link. A toggle has to say whether it is on
 * to people who can't see its colour, and the on/off looks must be whole
 * class names so Tailwind keeps them (F2).
 *
 * What is tapped (the button or link) is 44px tall and draws nothing; the
 * pill the customer sees is a 36px span inside it. `pillOf` finds that span.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Chip, ChipRow } from "@/components/ui/Chips";

/** The visible pill inside a chip's button or link. */
function pillOf(chip: HTMLElement): HTMLElement {
  return chip.firstElementChild as HTMLElement;
}

describe("a chip that filters", () => {
  it("acts when tapped", async () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Iworoko</Chip>);

    await userEvent.click(screen.getByRole("button", { name: "Iworoko" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("says whether it is on", () => {
    render(
      <>
        <Chip selected>All</Chip>
        <Chip selected={false}>Iworoko</Chip>
      </>,
    );

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Iworoko" })).toHaveAttribute("aria-pressed", "false");
  });

  it("looks filled when on and outlined when off, with whole class names", () => {
    render(
      <>
        <Chip selected>All</Chip>
        <Chip>Iworoko</Chip>
      </>,
    );
    const on = pillOf(screen.getByRole("button", { name: "All" }));
    const off = pillOf(screen.getByRole("button", { name: "Iworoko" }));

    expect(on).toHaveClass("bg-ink", "text-canvas");
    expect(on).not.toHaveClass("bg-surface");
    expect(off).toHaveClass("bg-surface", "text-ink", "ring-hairline");
    expect(off).not.toHaveClass("bg-ink");
  });

  it("is 44px tall to tap, around a pill that stays 36px", () => {
    render(<Chip>Iworoko</Chip>);
    const chip = screen.getByRole("button", { name: "Iworoko" });

    expect(chip).toHaveClass("h-11");
    expect(pillOf(chip)).toHaveClass("h-9", "rounded-full");
  });

  it("does not submit a form it sits in", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Chip>Iworoko</Chip>
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Iworoko" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("a chip that is a link", () => {
  it("goes to its page", () => {
    render(<Chip href="/blog?section=guides">Guides</Chip>);

    expect(screen.getByRole("link", { name: "Guides" })).toHaveAttribute("href", "/blog?section=guides");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the current one as on", () => {
    render(
      <Chip href="/blog" selected>
        All posts
      </Chip>,
    );

    const chip = screen.getByRole("link", { name: "All posts" });
    expect(pillOf(chip)).toHaveClass("bg-ink", "text-canvas");
    expect(chip).toHaveClass("h-11");
  });
});

describe("a row of chips", () => {
  it("holds its chips in order and scrolls sideways rather than wrapping on a phone", () => {
    const { container } = render(
      <ChipRow className="mt-4">
        <Chip>All</Chip>
        <Chip>Iworoko</Chip>
        <Chip>Osekita</Chip>
      </ChipRow>,
    );

    expect(screen.getAllByRole("button").map((chip) => chip.textContent)).toEqual(["All", "Iworoko", "Osekita"]);
    // The caller's classes go on a wrapper; the scroller inside it holds the chips.
    expect(container.firstElementChild).toHaveClass("mt-4");
    expect(container.firstElementChild?.firstElementChild).toHaveClass("ui-scroll-x", "flex");
  });
});
