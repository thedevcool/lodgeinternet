/**
 * Guards components/ui/Sheet.tsx: the bottom sheet / alert that carries the
 * checkout, the "keep this page open" warning and the code reveal.
 *
 * It has to live alongside Paystack's popup, which is why its rules are odd
 * and worth pinning:
 *  - the page's scroll lock is a counted class on <html>, never a style on
 *    <body> (Paystack resets body.style.overflow when its popup closes), and
 *    it must survive one of two open sheets closing;
 *  - a sheet that is not dismissible (the code is being prepared, a payment
 *    is running) must ignore Escape, a tap outside and the back button;
 *  - with `history`, the phone's back button closes the sheet instead of
 *    leaving the page.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Sheet from "@/components/ui/Sheet";

const html = document.documentElement;
const EXIT_ANIMATION_MS = 260;

/** The dimmed area behind a sheet's panel. */
function backdropOf(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement!.previousElementSibling as HTMLElement;
}

function pressEscape() {
  fireEvent.keyDown(document, { key: "Escape" });
}

/** The phone's back button, as the browser reports it. */
function pressBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

describe("opening and closing", () => {
  it("shows a dialog named by its title when open", () => {
    render(
      <Sheet open title="Complete your payment" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Complete your payment" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("Weekly plan");
    expect(screen.getByRole("heading", { name: "Complete your payment" })).toBeInTheDocument();
  });

  it("shows nothing while closed", () => {
    render(
      <Sheet open={false} title="Complete your payment" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Weekly plan")).toBeNull();
  });

  it("is an alert dialog, named for screen readers, when used as an alert", () => {
    render(
      <Sheet open variant="alert" ariaLabel="Before you pay">
        <p>Keep this page open until your code is displayed.</p>
      </Sheet>,
    );

    expect(screen.getByRole("alertdialog", { name: "Before you pay" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("plays its exit animation, then leaves the page", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <Sheet open title="Complete your payment" onClose={() => {}}>
          <p>Weekly plan</p>
        </Sheet>,
      );

      rerender(
        <Sheet open={false} title="Complete your payment" onClose={() => {}}>
          <p>Weekly plan</p>
        </Sheet>,
      );
      // Still drawn while it slides away.
      expect(screen.getByRole("dialog")).toHaveClass("animate-sheet-down");

      act(() => {
        vi.advanceTimersByTime(EXIT_ANIMATION_MS - 1);
      });
      expect(screen.queryByRole("dialog")).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("comes straight back if reopened while it was sliding away", () => {
    vi.useFakeTimers();
    try {
      const sheet = (open: boolean) => (
        <Sheet open={open} title="Complete your payment" onClose={() => {}}>
          <p>Weekly plan</p>
        </Sheet>
      );
      const { rerender } = render(sheet(true));

      rerender(sheet(false));
      act(() => {
        vi.advanceTimersByTime(100);
      });
      rerender(sheet(true));
      act(() => {
        vi.advanceTimersByTime(EXIT_ANIMATION_MS * 2);
      });

      expect(screen.getByRole("dialog")).toHaveClass("animate-sheet-up");
    } finally {
      vi.useRealTimers();
    }
  });

  it("draws inside the client portal when the page has one, so the site's fonts and colours apply", () => {
    const portal = document.createElement("div");
    portal.id = "client-portal";
    document.body.appendChild(portal);
    try {
      render(
        <Sheet open title="Complete your payment" onClose={() => {}}>
          <p>Weekly plan</p>
        </Sheet>,
      );

      expect(portal).toContainElement(screen.getByRole("dialog"));
    } finally {
      portal.remove();
    }
  });

  it("pins a footer, such as the Pay button, below its content", () => {
    render(
      <Sheet open title="Complete your payment" onClose={() => {}} footer={<button type="button">Pay ₦3,304</button>}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    expect(screen.getByRole("button", { name: "Pay ₦3,304" })).toBeInTheDocument();
  });
});

describe("dismissing a sheet", () => {
  it("closes on the X button", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Complete your payment" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Complete your payment" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a tap outside the panel, but not on a tap inside it", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Complete your payment" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    await userEvent.click(screen.getByText("Weekly plan"));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(backdropOf(screen.getByRole("dialog")));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Complete your payment" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "a" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("stops listening for Escape once closed", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open title="Complete your payment" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>,
    );
    rerender(
      <Sheet open={false} title="Complete your payment" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    pressEscape();

    expect(onClose).not.toHaveBeenCalled();
  });

  it("can hide the X and still close on Escape", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Complete your payment" onClose={onClose} showClose={false}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("a sheet that must not be dismissed", () => {
  it("ignores Escape, a tap outside and has no X while not dismissible", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Preparing your access code" onClose={onClose} dismissible={false}>
        <p>Processing your code...</p>
      </Sheet>,
    );

    pressEscape();
    await userEvent.click(backdropOf(screen.getByRole("dialog")));

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cannot be dismissed at all when it has no way to close (the payment warning)", async () => {
    render(
      <Sheet open variant="alert" ariaLabel="Before you pay">
        <button type="button">I Understand</button>
      </Sheet>,
    );

    pressEscape();
    await userEvent.click(backdropOf(screen.getByRole("alertdialog")));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("becomes dismissible again when the screen says so (the code has arrived)", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open ariaLabel="Preparing your access code" onClose={undefined}>
        <p>Processing your code...</p>
      </Sheet>,
    );
    pressEscape();

    rerender(
      <Sheet open ariaLabel="Your access code" onClose={onClose}>
        <p>LODGE-7H2K-99QX</p>
      </Sheet>,
    );
    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("locking the page behind a sheet", () => {
  it("locks scrolling with a class on <html> while open, and never styles <body>", () => {
    const { rerender } = render(
      <Sheet open title="Complete your payment" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    expect(html).toHaveClass("ui-scroll-locked");
    // Paystack resets body.style.overflow when its popup closes, so a lock
    // kept there would be silently undone.
    expect(document.body.style.overflow).toBe("");
    expect(document.body.getAttribute("style")).toBeNull();

    rerender(
      <Sheet open={false} title="Complete your payment" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>,
    );
    expect(html).not.toHaveClass("ui-scroll-locked");
  });

  it("does not lock the page while closed", () => {
    render(
      <Sheet open={false} title="Complete your payment" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    expect(html).not.toHaveClass("ui-scroll-locked");
  });

  it("keeps the page locked until the last of two open sheets has closed", () => {
    // The checkout sheet with the TV's MAC-address sheet opened over it.
    function TwoSheets({ checkout, mac }: { checkout: boolean; mac: boolean }) {
      return (
        <>
          <Sheet open={checkout} title="Complete your payment" onClose={() => {}}>
            <p>Weekly plan</p>
          </Sheet>
          <Sheet open={mac} title="Your TV's MAC address" layer="sheet-over" onClose={() => {}}>
            <p>00:1A:2B:3C:4D:5E</p>
          </Sheet>
        </>
      );
    }
    const { rerender } = render(<TwoSheets checkout mac />);
    expect(html).toHaveClass("ui-scroll-locked");

    rerender(<TwoSheets checkout mac={false} />);
    expect(html).toHaveClass("ui-scroll-locked");

    rerender(<TwoSheets checkout={false} mac={false} />);
    expect(html).not.toHaveClass("ui-scroll-locked");
  });

  it("keeps the count right when the sheets close in the order they opened", () => {
    function TwoSheets({ first, second }: { first: boolean; second: boolean }) {
      return (
        <>
          <Sheet open={first} title="First" onClose={() => {}}>
            <p>One</p>
          </Sheet>
          <Sheet open={second} title="Second" onClose={() => {}}>
            <p>Two</p>
          </Sheet>
        </>
      );
    }
    const { rerender } = render(<TwoSheets first second />);

    rerender(<TwoSheets first={false} second />);
    expect(html).toHaveClass("ui-scroll-locked");

    rerender(<TwoSheets first={false} second={false} />);
    expect(html).not.toHaveClass("ui-scroll-locked");

    // And a sheet opened afterwards locks again: the count did not go negative.
    rerender(<TwoSheets first second={false} />);
    expect(html).toHaveClass("ui-scroll-locked");
  });

  it("unlocks the page if the screen holding an open sheet goes away", () => {
    const { unmount } = render(
      <Sheet open title="Complete your payment" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    unmount();

    expect(html).not.toHaveClass("ui-scroll-locked");
  });
});

describe("two sheets open at once", () => {
  it("Escape closes only the one on top", () => {
    const closeCheckout = vi.fn();
    const closeMac = vi.fn();
    render(
      <>
        <Sheet open title="Complete your payment" onClose={closeCheckout}>
          <p>Weekly plan</p>
        </Sheet>
        <Sheet open title="Your TV's MAC address" layer="sheet-over" onClose={closeMac}>
          <p>00:1A:2B:3C:4D:5E</p>
        </Sheet>
      </>,
    );

    pressEscape();

    expect(closeMac).toHaveBeenCalledTimes(1);
    expect(closeCheckout).not.toHaveBeenCalled();
  });

  it("Escape reaches the one underneath once the top one has closed", () => {
    function TwoSheets({ onCloseCheckout }: { onCloseCheckout: () => void }) {
      const [macOpen, setMacOpen] = useState(true);
      return (
        <>
          <Sheet open title="Complete your payment" onClose={onCloseCheckout}>
            <p>Weekly plan</p>
          </Sheet>
          <Sheet open={macOpen} title="Your TV's MAC address" layer="sheet-over" onClose={() => setMacOpen(false)}>
            <p>00:1A:2B:3C:4D:5E</p>
          </Sheet>
        </>
      );
    }
    const closeCheckout = vi.fn();
    render(<TwoSheets onCloseCheckout={closeCheckout} />);

    pressEscape();
    expect(closeCheckout).not.toHaveBeenCalled();

    pressEscape();
    expect(closeCheckout).toHaveBeenCalledTimes(1);
  });

  it("a non-dismissible sheet on top shields the one underneath from Escape", () => {
    const closeCheckout = vi.fn();
    render(
      <>
        <Sheet open title="Complete your payment" onClose={closeCheckout}>
          <p>Weekly plan</p>
        </Sheet>
        <Sheet open variant="alert" layer="alert" ariaLabel="Before you pay">
          <p>Keep this page open.</p>
        </Sheet>
      </>,
    );

    pressEscape();

    expect(closeCheckout).not.toHaveBeenCalled();
  });
});

describe("the phone's back button", () => {
  /** Watches the history calls a sheet makes; `back` is held so jsdom doesn't navigate. */
  function watchHistory() {
    return {
      push: vi.spyOn(window.history, "pushState"),
      back: vi.spyOn(window.history, "back").mockImplementation(() => {}),
    };
  }

  it("is given something to go back to when a sheet with `history` opens", () => {
    const { push } = watchHistory();
    const before = window.location.href;

    render(
      <Sheet open history title="Choose a plan" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    expect(push).toHaveBeenCalledTimes(1);
    // Same address: only an extra step in the history.
    expect(window.location.href).toBe(before);
    expect(window.history.state).toHaveProperty("__sheet");
  });

  it("closes the sheet instead of leaving the page", () => {
    const { back } = watchHistory();
    const onClose = vi.fn();
    const sheet = (open: boolean) => (
      <Sheet open={open} history title="Choose a plan" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>
    );
    const { rerender } = render(sheet(true));

    pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);

    // The browser already went back once; the sheet must not go back again.
    rerender(sheet(false));
    expect(back).not.toHaveBeenCalled();
  });

  it("has its extra step removed when the sheet is closed by a button instead", () => {
    const { back } = watchHistory();
    const sheet = (open: boolean) => (
      <Sheet open={open} history title="Choose a plan" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>
    );
    const { rerender } = render(sheet(true));

    rerender(sheet(false));

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("leaves history alone if the page has already moved on", () => {
    const { back } = watchHistory();
    const sheet = (open: boolean) => (
      <Sheet open={open} history title="Choose a plan" onClose={() => {}}>
        <p>Weekly plan</p>
      </Sheet>
    );
    const { rerender } = render(sheet(true));

    // A navigation put its own entry on top of the sheet's.
    window.history.pushState({ page: "dashboard" }, "");
    rerender(sheet(false));

    expect(back).not.toHaveBeenCalled();
  });

  it("does not close a sheet that can't be dismissed right now, and stays on the page", () => {
    const { push } = watchHistory();
    const onClose = vi.fn();
    render(
      <Sheet open history title="Complete your payment" onClose={onClose} dismissible={false}>
        <p>Processing...</p>
      </Sheet>,
    );
    expect(push).toHaveBeenCalledTimes(1);

    pressBack();

    expect(onClose).not.toHaveBeenCalled();
    // The step the back button used up is put back.
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("is left alone by a sheet without `history`", () => {
    const { push, back } = watchHistory();
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open title="Complete your payment" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    pressBack();
    rerender(
      <Sheet open={false} title="Complete your payment" onClose={onClose}>
        <p>Weekly plan</p>
      </Sheet>,
    );

    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("keyboard focus", () => {
  it("moves into the sheet when it opens, and back to where it was when it closes", async () => {
    function Screen() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Buy Weekly
          </button>
          <Sheet open={open} title="Complete your payment" onClose={() => setOpen(false)}>
            <p>Weekly plan</p>
          </Sheet>
        </>
      );
    }
    render(<Screen />);
    const opener = screen.getByRole("button", { name: "Buy Weekly" });

    await userEvent.click(opener);
    // The panel itself takes focus, not an input: no keyboard pops up on a phone.
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("keeps Tab inside the sheet, wrapping from the last control to the first and back", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Behind the sheet</button>
        <Sheet open title="Complete your payment" onClose={() => {}}>
          <button type="button">Wallet</button>
          <button type="button">Pay ₦3,304</button>
        </Sheet>
      </>,
    );
    const panel = screen.getByRole("dialog");
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Pay ₦3,304" });
    // The sheet takes focus a frame after it opens. Wait for that first, or
    // it would land in the middle of the steps below and move focus itself.
    await waitFor(() => expect(panel).toHaveFocus());

    // Backwards from the panel itself goes to the last control, not behind the sheet.
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    expect(screen.getByRole("button", { name: "Behind the sheet" })).not.toHaveFocus();
  });
});
