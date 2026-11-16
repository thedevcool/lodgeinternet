/**
 * Guards components/giveaway/WelcomeCode.tsx: the welcome code a resident
 * claimed, as shown after claiming and on the Account page.
 *
 * The Account page's section must stay out of the way of the many customers
 * who never had a welcome code: nothing when there is none, and nothing when
 * the lookup fails.
 *
 * It is also where a code is given (2026-11-16): a new resident landing on
 * the page gets theirs in a sheet at once, with one claim and no button; an
 * older account at a hostel open to everyone gets a button. The sheet must
 * open only for a code given just now, or it would greet every visit.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WelcomeCodeSection, { WelcomeCodeRow, type WelcomeClaim, type WelcomeOffer } from "@/components/giveaway/WelcomeCode";
import { apiFetch } from "@/lib/apiClient";

vi.mock("@/lib/apiClient", () => ({ apiFetch: vi.fn() }));

const CLAIM: WelcomeClaim = {
  code: "WELC7Q2M",
  gives: "2GB for 1 day, up to 3 devices",
  hostel: "Palm Court",
  claimedAt: "2026-11-15T10:00:00Z",
};

const OFFER: WelcomeOffer = { hostel: "Palm Court", gives: "2GB for 1 day, up to 3 devices", auto: true };

/** The claim request the page makes: no poster token, so the backend uses the customer's own hostel. */
const CLAIM_CALL = ["/api/giveaways/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }];

function answer(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("a claimed welcome code", () => {
  it("shows the code and what it gives, exactly as the backend sent them", () => {
    render(<WelcomeCodeRow claim={CLAIM} />);

    expect(screen.getByText("WELC7Q2M")).toBeInTheDocument();
    expect(screen.getByText("2GB for 1 day, up to 3 devices")).toBeInTheDocument();
  });

  it("copies the code and says so", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<WelcomeCodeRow claim={CLAIM} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith("WELC7Q2M");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

describe("the Account page's welcome code section", () => {
  it("shows the customer's code, and where it came from", async () => {
    vi.mocked(apiFetch).mockResolvedValue(answer(200, { claim: CLAIM }));
    render(<WelcomeCodeSection />);

    expect(await screen.findByText("WELC7Q2M")).toBeInTheDocument();
    expect(screen.getByText("Your welcome code")).toBeInTheDocument();
    expect(screen.getByText(/Free from Lodge Internet at Palm Court/)).toBeInTheDocument();
    expect(vi.mocked(apiFetch).mock.calls).toEqual([["/api/giveaways/mine"]]);
  });

  it("shows nothing for a customer who has no welcome code", async () => {
    vi.mocked(apiFetch).mockResolvedValue(answer(200, { claim: null }));
    const { container } = render(<WelcomeCodeSection />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the lookup is refused or can't be made", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(answer(500, { error: "down" })).mockRejectedValueOnce(new Error("offline"));
    const first = render(<WelcomeCodeSection />);
    const second = render(<WelcomeCodeSection />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(first.container).toBeEmptyDOMElement();
    expect(second.container).toBeEmptyDOMElement();
  });
});

describe("a welcome code given on the Account page", () => {
  it("gives a new resident their code in a sheet as soon as they land, with no button to press", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(answer(200, { claim: null, offer: OFFER }))
      .mockResolvedValueOnce(answer(200, { claim: CLAIM, alreadyClaimed: false }));
    render(<WelcomeCodeSection />);

    const sheet = await screen.findByRole("dialog", { name: "Your free welcome code" });
    expect(sheet).toHaveTextContent("WELC7Q2M");
    expect(sheet).toHaveTextContent("We've emailed it to you too");
    expect(vi.mocked(apiFetch).mock.calls).toEqual([["/api/giveaways/mine"], CLAIM_CALL]);
    // ... and it is in its section of the page as well.
    expect(screen.getByText("Your welcome code")).toBeInTheDocument();
  });

  it("closes the sheet with Done and leaves the code on the page", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(answer(200, { claim: null, offer: OFFER }))
      .mockResolvedValueOnce(answer(200, { claim: CLAIM, alreadyClaimed: false }));
    render(<WelcomeCodeSection />);

    await user.click(await screen.findByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("WELC7Q2M")).toBeInTheDocument();
  });

  it("opens no sheet for a code claimed before, or one the backend says was already theirs", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(answer(200, { claim: CLAIM, offer: null }));
    const seen = render(<WelcomeCodeSection />);
    await seen.findByText("WELC7Q2M");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    seen.unmount();

    vi.mocked(apiFetch)
      .mockResolvedValueOnce(answer(200, { claim: null, offer: OFFER }))
      .mockResolvedValueOnce(answer(200, { claim: CLAIM, alreadyClaimed: true }));
    render(<WelcomeCodeSection />);
    await screen.findByText("WELC7Q2M");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows nothing when the claim on landing is refused", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(answer(200, { claim: null, offer: OFFER }))
      .mockResolvedValueOnce(answer(409, { error: "All the welcome codes at Palm Court have been claimed.", code: "GIVEAWAY_OUT_OF_CODES" }));
    const { container } = render(<WelcomeCodeSection />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("offers an older account a button, claims only when it is pressed, then shows the sheet", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(answer(200, { claim: null, offer: { ...OFFER, auto: false } }))
      .mockResolvedValueOnce(answer(200, { claim: CLAIM, alreadyClaimed: false }));
    render(<WelcomeCodeSection />);

    const button = await screen.findByRole("button", { name: "Get my free code" });
    expect(screen.getByText("2GB for 1 day, up to 3 devices")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await user.click(button);

    expect(await screen.findByRole("dialog", { name: "Your free welcome code" })).toHaveTextContent("WELC7Q2M");
    expect(screen.queryByRole("button", { name: "Get my free code" })).not.toBeInTheDocument();
  });

  it("shows the backend's reason when the button's claim is refused, and keeps the button", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(answer(200, { claim: null, offer: { ...OFFER, auto: false } }))
      .mockResolvedValueOnce(answer(409, { error: "All the welcome codes at Palm Court have been claimed.", code: "GIVEAWAY_OUT_OF_CODES" }));
    render(<WelcomeCodeSection />);

    await user.click(await screen.findByRole("button", { name: "Get my free code" }));

    expect(await screen.findByText("All the welcome codes at Palm Court have been claimed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get my free code" })).toBeInTheDocument();
  });
});
