/**
 * Guards components/ui/SegmentedControl.tsx: the pill of two or three
 * choices (Log in / Create account, 3 Devices / 5 Devices / Unlimited / TV).
 *
 * The plan tabs decide which plans a customer sees, so the control has to
 * report the choice tapped, mark the current one for screen readers, and
 * slide its thumb under it.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SegmentedControl, { type Segment } from "@/components/ui/SegmentedControl";

const PLAN_TABS: Segment[] = [
  { value: "device-3", label: "3 Devices" },
  { value: "device-5", label: "5 Devices" },
  { value: "unlimited", label: "Unlimited" },
];

/** The sliding thumb: the one decorative element in the control. */
function thumb(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>("[role=tablist] > span[aria-hidden]")!;
}

describe("choosing a segment", () => {
  it("offers every choice as a tab, in order, under the control's name", () => {
    render(<SegmentedControl segments={PLAN_TABS} value="device-3" ariaLabel="Plan type" />);

    expect(screen.getByRole("tablist", { name: "Plan type" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["3 Devices", "5 Devices", "Unlimited"]);
  });

  it("marks only the current choice as selected", () => {
    render(<SegmentedControl segments={PLAN_TABS} value="device-5" />);

    expect(screen.getByRole("tab", { name: "5 Devices" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "3 Devices" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Unlimited" })).toHaveAttribute("aria-selected", "false");
  });

  it("reports the choice that was tapped", async () => {
    const onSelect = vi.fn();
    render(<SegmentedControl segments={PLAN_TABS} value="device-3" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("tab", { name: "Unlimited" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("unlimited");
  });

  it("does not change by itself: the screen decides what is selected", async () => {
    render(<SegmentedControl segments={PLAN_TABS} value="device-3" onSelect={() => {}} />);

    await userEvent.click(screen.getByRole("tab", { name: "Unlimited" }));

    expect(screen.getByRole("tab", { name: "3 Devices" })).toHaveAttribute("aria-selected", "true");
  });

  it("copes with a tap when nothing is listening", async () => {
    render(<SegmentedControl segments={PLAN_TABS} value="device-3" />);

    await userEvent.click(screen.getByRole("tab", { name: "Unlimited" }));

    expect(screen.getByRole("tab", { name: "3 Devices" })).toHaveAttribute("aria-selected", "true");
  });

  it("gives the current choice the stronger text colour, with whole class names", () => {
    render(<SegmentedControl segments={PLAN_TABS} value="device-5" />);

    expect(screen.getByRole("tab", { name: "5 Devices" })).toHaveClass("text-ink");
    expect(screen.getByRole("tab", { name: "3 Devices" })).toHaveClass("text-ink-2", "hover:text-ink");
  });
});

describe("the sliding thumb", () => {
  it("is as wide as one segment and sits under the current choice", () => {
    const { container, rerender } = render(<SegmentedControl segments={PLAN_TABS} value="device-3" />);
    // A third of the track, less its 4px padding either side.
    expect(thumb(container).style.width).toContain("100% - 8px");
    expect(thumb(container).style.width).toMatch(/\/ 3|0\.3333/);
    expect(thumb(container).style.transform).toBe("translateX(0%)");

    rerender(<SegmentedControl segments={PLAN_TABS} value="device-5" />);
    expect(thumb(container).style.transform).toBe("translateX(100%)");

    rerender(<SegmentedControl segments={PLAN_TABS} value="unlimited" />);
    expect(thumb(container).style.transform).toBe("translateX(200%)");
  });

  it("rests under the first choice when the value matches none", () => {
    const { container } = render(<SegmentedControl segments={PLAN_TABS} value="tv" />);

    expect(thumb(container).style.transform).toBe("translateX(0%)");
    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveAttribute("aria-selected", "false");
  });
});

describe("segments that are pages", () => {
  const AUTH_TABS: Segment[] = [
    { value: "login", label: "Log in", href: "/login" },
    { value: "register", label: "Create account", href: "/register" },
  ];

  it("are real links, so Log in and Create account each have an address", () => {
    render(<SegmentedControl segments={AUTH_TABS} value="login" />);

    const login = screen.getByRole("tab", { name: "Log in" });
    const register = screen.getByRole("tab", { name: "Create account" });
    expect(login.tagName).toBe("A");
    expect(login).toHaveAttribute("href", "/login");
    expect(register).toHaveAttribute("href", "/register");
    expect(login).toHaveAttribute("aria-selected", "true");
    expect(register).toHaveAttribute("aria-selected", "false");
  });
});
