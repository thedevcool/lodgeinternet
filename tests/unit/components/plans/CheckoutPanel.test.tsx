/**
 * Guards components/plans/CheckoutPanel.tsx: the "Complete your payment"
 * panel, at the two points where it touches money.
 *
 *  - Pay must start the purchase with NO arguments. The hook reads its first
 *    argument as "the customer has acknowledged the keep-this-page-open
 *    warning"; a click or submit event passed by mistake is truthy and would
 *    skip that warning (rule 1 at the top of usePlansCheckout.ts). The same
 *    goes for the warning's own "I Understand" button.
 *  - The amount on the Pay button and in the order summary is the backend's
 *    total (P2), whichever way the customer pays.
 *
 * The panel only draws what the hook gives it, so the hook is a stand-in
 * here; its behaviour is covered in usePlansCheckout.test.tsx.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutPanel from "@/components/plans/CheckoutPanel";
import { PaymentWarningAlert } from "@/components/plans/PaymentSheets";
import type { PlansCheckout } from "@/components/plans/usePlansCheckout";

// The backend's total (₦3,350) is deliberately not what the fallback formula
// gives for a ₦3,000 plan (₦3,304), so the tests can tell the two apart.
const WEEKLY = {
  id: "plan-weekly-3",
  name: "Weekly",
  planType: "device",
  usersCount: 3,
  duration: 7,
  price: 3000,
  total: 3350,
  isActive: true,
};

/** What the hook hands the panel for a signed-in customer paying by card. */
function checkout(overrides: Record<string, unknown> = {}): PlansCheckout {
  return {
    currentUser: { uid: "user-chiamaka-01", email: "chiamaka@example.com" },
    email: "chiamaka@example.com",
    selectedPlan: WEEKLY,
    selectedHostel: "Ayoni Block A",
    error: "",
    codesNotAvailable: false,
    payDisabled: false,
    purchasing: false,
    paystackLoaded: true,
    payMethod: "card",
    walletOn: false,
    walletBalanceKobo: 0,
    walletCovers: false,
    cardOffered: true,
    planTotalKobo: 335_000,
    tvDisabled: false,
    checkingTvMac: false,
    showPaymentWarning: false,
    loadWallet: vi.fn(),
    handlePurchase: vi.fn(),
    handleTvPurchaseStart: vi.fn(),
    handleEmailChange: vi.fn(),
    choosePayMethod: vi.fn(),
    acknowledgePaymentWarning: vi.fn(),
    ...overrides,
  } as unknown as PlansCheckout;
}

beforeEach(() => {
  // The WhatsApp card under the panel is not part of these tests.
  vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
  vi.stubEnv("NEXT_PUBLIC_WHATSAPP_URL", "");
});

describe("the Pay button", () => {
  it("starts the purchase with no arguments, so the one-time warning can't be skipped", async () => {
    const c = checkout();
    render(<CheckoutPanel c={c} />);

    await userEvent.click(screen.getByRole("button", { name: "Pay ₦3,350" }));

    expect(c.handlePurchase).toHaveBeenCalledTimes(1);
    // Not the click, not the form's submit event: nothing at all.
    expect(vi.mocked(c.handlePurchase).mock.calls[0]).toEqual([]);
  });

  it("does the same when the form is submitted from the keyboard", async () => {
    const c = checkout({ currentUser: null, email: "tunde@example.com" });
    render(<CheckoutPanel c={c} />);

    await userEvent.type(screen.getByLabelText("Email address (for receipt)"), "{Enter}");

    expect(c.handlePurchase).toHaveBeenCalledTimes(1);
    expect(vi.mocked(c.handlePurchase).mock.calls[0]).toEqual([]);
  });

  it("does nothing while Pay is switched off", async () => {
    const c = checkout({ payDisabled: true });
    render(<CheckoutPanel c={c} />);

    await userEvent.click(screen.getByRole("button", { name: "Pay ₦3,350" }));

    expect(c.handlePurchase).not.toHaveBeenCalled();
  });

  it("cannot be tapped twice while a payment is running", async () => {
    const c = checkout({ purchasing: true, payDisabled: true });
    render(<CheckoutPanel c={c} />);
    const pay = screen.getByRole("button", { name: /Processing/ });

    await userEvent.click(pay);

    expect(pay).toBeDisabled();
    expect(c.handlePurchase).not.toHaveBeenCalled();
  });

  it("says so, and stays off, when the plan has no codes left", () => {
    render(<CheckoutPanel c={checkout({ codesNotAvailable: true, payDisabled: true })} />);

    expect(screen.getByRole("button", { name: "No Codes Available" })).toBeDisabled();
    expect(screen.getByText("No codes available for this plan")).toBeInTheDocument();
  });

  it("waits for Paystack to load before a card payment", () => {
    render(<CheckoutPanel c={checkout({ paystackLoaded: false, payDisabled: true })} />);

    expect(screen.getByRole("button", { name: "Loading payment..." })).toBeDisabled();
  });
});

describe("the amount shown", () => {
  it("is the backend's total, in the summary and on the Pay button", () => {
    render(<CheckoutPanel c={checkout()} />);

    expect(screen.getByText("Total to Pay").nextElementSibling).toHaveTextContent("₦3,350");
    expect(screen.getByRole("button", { name: "Pay ₦3,350" })).toBeInTheDocument();
    // The bare price and the fallback formula's figure appear nowhere.
    expect(document.body).not.toHaveTextContent("3,000");
    expect(document.body).not.toHaveTextContent("3,304");
  });

  it("is the same total when paying from the wallet or by transfer", () => {
    const wallet = { walletOn: true, walletBalanceKobo: 500_000, walletCovers: true, cardOffered: false };
    const { rerender } = render(<CheckoutPanel c={checkout({ ...wallet, payMethod: "wallet" })} />);
    expect(screen.getByRole("button", { name: "Pay ₦3,350 from wallet" })).toBeInTheDocument();

    rerender(<CheckoutPanel c={checkout({ ...wallet, payMethod: "transfer" })} />);
    expect(screen.getByRole("button", { name: "Pay ₦3,350 by transfer" })).toBeInTheDocument();
  });

  it("shows the customer's wallet balance, and how much more a short wallet needs", () => {
    render(
      <CheckoutPanel
        c={checkout({ walletOn: true, walletBalanceKobo: 100_000, walletCovers: false, cardOffered: false, payMethod: "transfer" })}
      />,
    );

    const walletOption = screen.getByRole("radio", { name: /Wallet/ });
    expect(walletOption).toHaveTextContent("₦1,000");
    // ₦3,350 less the ₦1,000 already there.
    expect(walletOption).toHaveTextContent("Top up ₦2,350 more to use your wallet");
    expect(walletOption).toHaveAttribute("aria-disabled", "true");
  });
});

describe("choosing how to pay", () => {
  const WALLET = { walletOn: true, walletBalanceKobo: 500_000, walletCovers: true, cardOffered: false, payMethod: "wallet" };

  it("offers only Paystack when the customer has no wallet", () => {
    render(<CheckoutPanel c={checkout()} />);

    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText("Pay securely with Paystack")).toBeInTheDocument();
  });

  it("offers Wallet and Bank transfer, and Card only when the bank couldn't open an account number", () => {
    const { rerender } = render(<CheckoutPanel c={checkout(WALLET)} />);
    expect(screen.getAllByRole("radio").map((option) => option.textContent)).toEqual([
      expect.stringContaining("Wallet"),
      expect.stringContaining("Bank transfer"),
    ]);
    expect(screen.getByRole("radio", { name: /Wallet/ })).toHaveAttribute("aria-checked", "true");

    rerender(<CheckoutPanel c={checkout({ ...WALLET, cardOffered: true })} />);
    expect(screen.getByRole("radio", { name: /Card/ })).toBeInTheDocument();
  });

  it("switches method on a tap", async () => {
    const c = checkout(WALLET);
    render(<CheckoutPanel c={c} />);

    await userEvent.click(screen.getByRole("radio", { name: /Bank transfer/ }));

    expect(c.choosePayMethod).toHaveBeenCalledWith("transfer");
    // Picking a method is not paying.
    expect(c.handlePurchase).not.toHaveBeenCalled();
  });

  it("cannot pick a wallet that is short", async () => {
    const c = checkout({ ...WALLET, walletBalanceKobo: 100_000, walletCovers: false, payMethod: "transfer" });
    render(<CheckoutPanel c={c} />);

    await userEvent.click(screen.getByRole("radio", { name: /Wallet/ }));

    expect(c.choosePayMethod).not.toHaveBeenCalled();
  });

  it("cannot change method under a payment that is already running", async () => {
    const c = checkout({ ...WALLET, purchasing: true, payDisabled: true });
    render(<CheckoutPanel c={c} />);

    await userEvent.click(screen.getByRole("radio", { name: /Bank transfer/ }));

    expect(c.choosePayMethod).not.toHaveBeenCalled();
  });
});

describe("the rest of the panel", () => {
  it("checks the wallet balance afresh when it opens", () => {
    const c = checkout();
    render(<CheckoutPanel c={c} />);

    expect(c.loadWallet).toHaveBeenCalledTimes(1);
  });

  it("shows the message the checkout has for the customer", () => {
    render(<CheckoutPanel c={checkout({ error: "Weekly has just sold out at Ayoni Block A." })} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Weekly has just sold out at Ayoni Block A.");
  });

  it("says who is paying when signed in, and asks for an email when not", () => {
    const { rerender } = render(<CheckoutPanel c={checkout()} />);
    expect(screen.getByText("Purchasing as chiamaka@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email address (for receipt)")).toBeNull();

    rerender(<CheckoutPanel c={checkout({ currentUser: null, email: "" })} />);
    expect(screen.getByLabelText("Email address (for receipt)")).toBeRequired();
  });

  it("draws nothing until a plan is chosen", () => {
    const { container } = render(<CheckoutPanel c={checkout({ selectedPlan: undefined })} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("starts a TV plan's purchase with no arguments too", async () => {
    const c = checkout({ selectedPlan: { ...WEEKLY, id: "plan-tv-30", name: "TV Monthly", planType: "tv", duration: 30 } });
    render(<CheckoutPanel c={c} />);

    await userEvent.click(screen.getByRole("button", { name: "Continue to Purchase" }));

    expect(vi.mocked(c.handleTvPurchaseStart).mock.calls).toEqual([[]]);
    expect(c.handlePurchase).not.toHaveBeenCalled();
  });
});

describe("the 'keep this page open' warning", () => {
  it("acknowledges with no arguments when I Understand is tapped", async () => {
    const c = checkout({ showPaymentWarning: true });
    render(<PaymentWarningAlert c={c} />);

    await userEvent.click(screen.getByRole("button", { name: "I Understand" }));

    expect(vi.mocked(c.acknowledgePaymentWarning).mock.calls).toEqual([[]]);
  });

  it("can only be left through I Understand: Escape does not dismiss it", async () => {
    const c = checkout({ showPaymentWarning: true });
    render(<PaymentWarningAlert c={c} />);

    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("alertdialog", { name: "Before you pay" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(c.acknowledgePaymentWarning).not.toHaveBeenCalled();
  });

  it("is not drawn until the checkout asks for it", () => {
    render(<PaymentWarningAlert c={checkout({ showPaymentWarning: false })} />);

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
