/**
 * Guards components/ui/States.tsx: what a screen shows while it loads, when
 * there is nothing to show, and when loading failed.
 *
 * Every data view must have all three (F4): a failed request has to look
 * like a failure with a way to try again, never like an empty hostel list or
 * a blank page.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from "@/components/ui/States";

describe("nothing to show", () => {
  it("says so, with an explanation", () => {
    render(<EmptyState title="No codes yet" message="Codes you buy will show here." />);

    expect(screen.getByText("No codes yet")).toBeInTheDocument();
    expect(screen.getByText("Codes you buy will show here.")).toBeInTheDocument();
  });

  it("offers a next step when the screen has one", () => {
    render(<EmptyState title="No codes yet" action={<a href="/hostels">Find your hostel</a>} />);

    expect(screen.getByRole("link", { name: "Find your hostel" })).toHaveAttribute("href", "/hostels");
  });

  it("shows only the title when that is all it is given", () => {
    const { container } = render(<EmptyState title="No codes yet" />);

    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows the icon it is given", () => {
    render(<EmptyState title="No codes yet" icon={<svg data-testid="empty-icon" />} />);

    expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
  });
});

describe("loading failed", () => {
  it("says the page couldn't load and what to do", () => {
    render(<ErrorState />);

    expect(screen.getByText("Couldn’t load this page")).toBeInTheDocument();
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
  });

  it("uses the screen's own words when given", () => {
    render(<ErrorState title="Couldn’t load your wallet" message="Your money is safe. Try again in a moment." />);

    expect(screen.getByText("Couldn’t load your wallet")).toBeInTheDocument();
    expect(screen.getByText("Your money is safe. Try again in a moment.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn’t load this page")).toBeNull();
  });

  it("tries again when Try again is tapped", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("tries again on every tap, for a connection that is still down", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("shows no Try again button when there is nothing to retry", () => {
    render(<ErrorState />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("loading", () => {
  it("shows a list-shaped placeholder and tells screen readers it is loading", () => {
    render(<ListSkeleton rows={3} />);

    // role="status": without a role the "Loading" label was ignored.
    const list = screen.getByRole("status", { name: "Loading" });
    expect(list).toHaveAttribute("aria-busy", "true");
    // Each row: a tile, a title and a subtitle.
    expect(list.children).toHaveLength(3);
    expect(list.querySelectorAll(".ui-skeleton")).toHaveLength(9);
  });

  it("shows four rows unless told otherwise", () => {
    render(<ListSkeleton />);

    expect(screen.getByLabelText("Loading").children).toHaveLength(4);
  });

  it("uses the shimmering block, hidden from screen readers, at the size asked", () => {
    const { container } = render(<Skeleton className="h-12 w-full" />);

    const block = container.firstElementChild!;
    expect(block).toHaveClass("ui-skeleton", "h-12", "w-full");
    expect(block).toHaveAttribute("aria-hidden", "true");
  });
});
