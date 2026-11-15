/**
 * Guards components/ui/TextField.tsx: the labelled input on every form
 * (sign in, register, checkout email, phone number).
 *
 * The label has to belong to the input, so a tap on the label focuses it and
 * a screen reader names it, and an error has to be both seen and announced:
 * the customer is usually fixing a typo on a small phone.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TextField from "@/components/ui/TextField";

describe("a field and its label", () => {
  it("names the input by its label", () => {
    render(<TextField label="Email address" />);

    expect(screen.getByLabelText("Email address")).toBe(screen.getByRole("textbox", { name: "Email address" }));
  });

  it("focuses the input when the label is tapped", async () => {
    render(<TextField label="Email address" />);

    await userEvent.click(screen.getByText("Email address"));

    expect(screen.getByLabelText("Email address")).toHaveFocus();
  });

  it("keeps two fields on one form apart", () => {
    render(
      <>
        <TextField label="Email address" defaultValue="chiamaka@example.com" />
        <TextField label="Phone number" defaultValue="08012345678" />
      </>,
    );

    const email = screen.getByLabelText("Email address");
    const phone = screen.getByLabelText("Phone number");
    expect(email).toHaveValue("chiamaka@example.com");
    expect(phone).toHaveValue("08012345678");
    expect(email.id).not.toBe(phone.id);
  });

  it("uses the id a form gives it", () => {
    render(<TextField label="Email address" id="checkout-email" />);

    expect(screen.getByLabelText("Email address")).toHaveAttribute("id", "checkout-email");
  });

  it("passes the usual input settings straight through", async () => {
    const onChange = vi.fn();
    render(
      <TextField
        label="Email address"
        type="email"
        placeholder="your.email@example.com"
        autoComplete="email"
        required
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Email address");

    await userEvent.type(input, "a@b.c");

    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("placeholder", "your.email@example.com");
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(input).toBeRequired();
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(input).toHaveValue("a@b.c");
  });

  it("shows what sits beside the label, such as a Forgot password link", () => {
    render(<TextField label="Password" type="password" labelAside={<a href="/forgot-password">Forgot password?</a>} />);

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });
});

describe("a field's hint and error", () => {
  it("shows a hint under the field", () => {
    render(<TextField label="Phone number" hint="We only use it to open your account number." />);

    expect(screen.getByText("We only use it to open your account number.")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone number")).not.toHaveAttribute("aria-invalid");
  });

  it("shows the error and marks the input as invalid", () => {
    render(<TextField label="Email address" error="Enter a valid email address." />);

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email address")).toBeInvalid();
  });

  it("shows the error instead of the hint, not both", () => {
    render(<TextField label="Phone number" hint="Eleven digits." error="That number is too short." />);

    expect(screen.getByText("That number is too short.")).toBeInTheDocument();
    expect(screen.queryByText("Eleven digits.")).toBeNull();
  });

  it("is not marked invalid without an error", () => {
    render(
      <>
        <TextField label="Email address" error={null} />
        <TextField label="Phone number" error="" />
      </>,
    );

    expect(screen.getByLabelText("Email address")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Phone number")).not.toHaveAttribute("aria-invalid");
  });

  // The error text used to be drawn under the input with nothing tying it
  // to the input (no aria-describedby), so a screen reader said "invalid"
  // without saying why.
  it("reads the error out with the field for screen-reader users", () => {
    render(<TextField label="Email address" error="Enter a valid email address." />);

    expect(screen.getByLabelText("Email address")).toHaveAccessibleDescription("Enter a valid email address.");
  });

  it("reads the hint out with the field too, and nothing when there is neither", () => {
    render(
      <>
        <TextField label="Phone number" hint="We only use it to open your account number." />
        <TextField label="Full name" />
      </>,
    );

    expect(screen.getByLabelText("Phone number")).toHaveAccessibleDescription("We only use it to open your account number.");
    expect(screen.getByLabelText("Full name")).not.toHaveAttribute("aria-describedby");
  });

  it("announces an error that appears while the customer is typing", () => {
    // The line under the input lives in a polite live region that is on the
    // page before the error is, which is what makes a screen reader read it.
    const { rerender } = render(<TextField label="Confirm password" />);
    const region = screen.getByLabelText("Confirm password").closest("div")!.parentElement!.querySelector("[aria-live]")!;
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    rerender(<TextField label="Confirm password" error="Passwords don't match yet." />);

    expect(region).toHaveTextContent("Passwords don't match yet.");
  });
});

describe("a password field", () => {
  it("hides what is typed until the customer asks to see it", async () => {
    render(<TextField label="Password" type="password" defaultValue="correct horse" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("correct horse");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("does not submit the form when the show button is tapped", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TextField label="Password" type="password" />
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("has no show button on an ordinary field", () => {
    render(<TextField label="Email address" type="email" />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
