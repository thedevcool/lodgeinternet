/**
 * Guards components/giveaway/WelcomeCode.tsx: the welcome code a resident
 * claimed, as shown after claiming and on the Account page.
 *
 * The Account page's section must stay out of the way of the many customers
 * who never had a welcome code: nothing when there is none, and nothing when
 * the lookup fails.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WelcomeCodeSection, { WelcomeCodeRow, type WelcomeClaim } from "@/components/giveaway/WelcomeCode";
import { apiFetch } from "@/lib/apiClient";

vi.mock("@/lib/apiClient", () => ({ apiFetch: vi.fn() }));

const CLAIM: WelcomeClaim = {
  code: "WELC7Q2M",
  gives: "2GB for 1 day, up to 3 devices",
  hostel: "Palm Court",
  claimedAt: "2026-11-15T10:00:00Z",
};

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
