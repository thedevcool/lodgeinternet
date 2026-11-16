/**
 * The tests' handle on the stand-in API (e2e/mock-api.mjs).
 *
 * Each test gets its own world on the stand-in, named by a random session id
 * that the browser carries as the `e2e_session` cookie. This class starts
 * that world with the scenario the test wants, signs customers and admins in
 * by cookie (the same cookies the stand-in's login routes set), and reads
 * back what the website did (codes held, released, claimed) for assertions.
 *
 * The scenario knobs are documented once, at DEFAULT_SCENARIO in
 * e2e/mock-api.mjs; the `Scenario` type below mirrors them.
 */
import type { APIRequestContext, BrowserContext } from "@playwright/test";
import customers from "../fixtures/customers.json";

export const API = "http://localhost:4010";

export type CustomerKey = keyof typeof customers.customers;
export type AdminKey = "ifeoma" | "segun";

/** One route to break: an error status, or the connection cut. `times` left out = every time. */
export type BrokenRoute = { route: string; status?: number; drop?: boolean; times?: number };

export type Scenario = {
  directory?: "default" | "empty" | "with-school";
  plans?: "default" | "empty";
  /** Codes left, by plan key (e2e/fixtures/plans.json). */
  stock?: Record<string, number>;
  reserve?: "ok" | "sold-out";
  wallet?: "off" | "funded" | "short" | "new" | "dva-failed";
  claim?: "ok" | "error" | "unfulfilled";
  blog?: "default" | "empty";
  covers?: "none" | "approved" | "new";
  tv?: "none" | "returning";
  /** Welcome codes at Palm Court (poster link: WELCOME_POSTER in support/data.ts). */
  giveaway?: "none" | "open" | "ended" | "out-of-codes" | "everyone";
  maintenance?: boolean;
  fail?: BrokenRoute[];
  /** Routes ("GET /api/hostels") whose answer waits for `release()`. */
  hold?: string[];
};

export type Reservation = { reservationId: string; planId: string; hostel: string; uid: string; released: boolean; claimed: boolean };

export type StandInState = {
  scenario: Required<Scenario>;
  reservations: Reservation[];
  claims: { paymentRef: string; planId: string; reservationId: string | null; code: string }[];
  orders: { pendingId: string; planId: string; reservationId: string | null; amountKobo: number; paid: boolean; polls: number }[];
  walletBalanceKobo: number;
  heldRoutes: string[];
  log: { method: string; path: string; query: string; body: Record<string, unknown>; client: string | null }[];
};

export class StandIn {
  constructor(
    private readonly request: APIRequestContext,
    private readonly context: BrowserContext,
    /** This test's world on the stand-in. */
    readonly session: string,
  ) {}

  private async post(path: string, data: object): Promise<void> {
    const response = await this.request.post(`${API}${path}`, { data: { session: this.session, ...data } });
    if (!response.ok()) throw new Error(`Stand-in API refused ${path}: ${response.status()} ${await response.text()}`);
  }

  /** Start this test's world afresh with these knobs (everything else default). */
  async scenario(knobs: Scenario = {}): Promise<void> {
    await this.post("/__scenario", knobs);
  }

  /** Let held answers go (all of them, or one route's). */
  async release(route?: string): Promise<void> {
    await this.post("/__release", route ? { route } : {});
  }

  /** The customer's bank transfer has arrived: the next status poll says paid. */
  async transferLanded(): Promise<void> {
    await this.post("/__transfer-landed", {});
  }

  /** What the website did in this world so far. */
  async state(): Promise<StandInState> {
    const response = await this.request.get(`${API}/__state?session=${encodeURIComponent(this.session)}`);
    return (await response.json()) as StandInState;
  }

  /** Sign a fixture customer in, as the stand-in's login route would. */
  async signIn(who: CustomerKey): Promise<(typeof customers.customers)[CustomerKey]> {
    const customer = customers.customers[who];
    await this.context.addCookies([
      { name: "lodge_customer", value: customer.uid, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
    return customer;
  }

  /** Sign an admin in for the blog review desk. */
  async signInAdmin(who: AdminKey): Promise<void> {
    await this.context.addCookies([
      { name: "lodge_admin", value: who, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
  }
}
