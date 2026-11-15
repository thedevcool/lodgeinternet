/**
 * Guards components/ui/CodeBoxes.tsx: the six boxes for the 6-digit code we
 * email (register, forgot password).
 *
 * There is one real input laid over six display boxes, so that pasting the
 * whole code, the phone's "from Messages/Mail" autofill and the number
 * keyboard all work. The boxes only mirror what the input holds; these tests
 * check the mirror stays true while typing, pasting and deleting.
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CodeBoxes from "@/components/ui/CodeBoxes";

/** The component holds no value of its own; this keeps it, as a page would. */
function Field({ start = "", onChange }: { start?: string; onChange?: (value: string) => void }) {
  const [value, setValue] = useState(start);
  return (
    <CodeBoxes
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

/** Found by its spoken name, which must not pick up the digits in the boxes. */
function input(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Verification Code" });
}

/** What each of the six boxes shows, left to right. */
function boxes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("label > span[aria-hidden] > span")).map((box) => box.textContent ?? "");
}

/** Which box (0–5) has the focus ring, or -1. */
function highlightedBox(container: HTMLElement): number {
  return Array.from(container.querySelectorAll("label > span[aria-hidden] > span")).findIndex((box) =>
    box.classList.contains("ring-accent"),
  );
}

describe("the code field", () => {
  it("is one labelled input set up for a one-time code on a phone", () => {
    render(<Field />);

    expect(input()).toHaveAttribute("inputmode", "numeric");
    expect(input()).toHaveAttribute("autocomplete", "one-time-code");
    expect(input()).toHaveAttribute("maxlength", "6");
    expect(input()).toBeRequired();
  });

  it("starts as six empty boxes", () => {
    const { container } = render(<Field />);

    expect(boxes(container)).toEqual(["", "", "", "", "", ""]);
  });

  it("shows a code it is given", () => {
    const { container } = render(<Field start="482913" />);

    expect(boxes(container)).toEqual(["4", "8", "2", "9", "1", "3"]);
  });
});

describe("typing the code", () => {
  it("fills the boxes left to right, one digit each", async () => {
    const user = userEvent.setup();
    const { container } = render(<Field />);

    await user.type(input(), "482");

    expect(boxes(container)).toEqual(["4", "8", "2", "", "", ""]);
    expect(input()).toHaveValue("482");
  });

  it("reports the code so far after every digit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    await user.type(input(), "4829");

    expect(onChange.mock.calls.map(([value]) => value)).toEqual(["4", "48", "482", "4829"]);
  });

  it("stops at six digits", async () => {
    const user = userEvent.setup();
    const { container } = render(<Field />);

    await user.type(input(), "48291377");

    expect(input()).toHaveValue("482913");
    expect(boxes(container)).toEqual(["4", "8", "2", "9", "1", "3"]);
  });

  it("rings the box the next digit will land in, and the last box once full", async () => {
    const user = userEvent.setup();
    const { container } = render(<Field />);

    await user.click(input());
    expect(highlightedBox(container)).toBe(0);

    await user.keyboard("48");
    expect(highlightedBox(container)).toBe(2);

    await user.keyboard("2913");
    expect(highlightedBox(container)).toBe(5);
  });

  it("rings no box once the customer has moved on", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <Field />
        <button type="button">Verify</button>
      </>,
    );

    await user.click(input());
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(highlightedBox(container)).toBe(-1);
  });
});

describe("pasting the code", () => {
  it("takes a whole code in one go", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Field onChange={onChange} />);

    await user.click(input());
    await user.paste("482913");

    expect(boxes(container)).toEqual(["4", "8", "2", "9", "1", "3"]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("482913");
  });

  it("replaces a half-typed code when everything is selected first", async () => {
    const user = userEvent.setup();
    const { container } = render(<Field start="11" />);

    await user.click(input());
    await user.keyboard("{Control>}a{/Control}");
    await user.paste("482913");

    expect(boxes(container)).toEqual(["4", "8", "2", "9", "1", "3"]);
  });
});

describe("correcting the code", () => {
  it("removes the last digit on backspace and empties its box", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Field start="482913" onChange={onChange} />);

    await user.click(input());
    await user.keyboard("{Backspace}");

    expect(boxes(container)).toEqual(["4", "8", "2", "9", "1", ""]);
    expect(onChange).toHaveBeenLastCalledWith("48291");
    expect(highlightedBox(container)).toBe(5);
  });

  it("can be cleared digit by digit, then typed again", async () => {
    const user = userEvent.setup();
    const { container } = render(<Field start="48" />);

    await user.click(input());
    await user.keyboard("{Backspace}{Backspace}");
    expect(boxes(container)).toEqual(["", "", "", "", "", ""]);
    expect(highlightedBox(container)).toBe(0);

    // One more backspace on an empty field changes nothing.
    await user.keyboard("{Backspace}");
    expect(boxes(container)).toEqual(["", "", "", "", "", ""]);

    await user.keyboard("77");
    expect(boxes(container)).toEqual(["7", "7", "", "", "", ""]);
  });
});
