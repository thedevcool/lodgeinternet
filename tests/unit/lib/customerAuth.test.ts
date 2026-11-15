/**
 * Guards lib/customerAuth.ts: who the website thinks is signed in.
 *
 * The sign-in itself is an HttpOnly cookie the backend keeps; this module
 * only remembers who that is, so pages can show "Sign in" or "Account" and
 * the checkout knows whose code to save. It must follow the backend at every
 * turn: signed in after a good password, still signed out after a bad one,
 * and signed out as soon as the backend refuses a request (a password reset
 * or an admin block ends the session from elsewhere).
 *
 * The module keeps its state for the life of the page, so every test loads a
 * fresh copy, and takes down the window listeners that copy put up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBackend, json, type FakeBackend } from "../../helpers/backend";

const CHIAMAKA = { userId: "user-chiamaka-01", email: "chiamaka@example.com" };
const NOT_SIGNED_IN = () => json({ error: "Please sign in.", code: "NOT_SIGNED_IN" }, 401);

let backend: FakeBackend;

beforeEach(() => {
  backend = fakeBackend();
  vi.resetModules();

  // Each fresh copy of the module listens on `window`; left up, an earlier
  // test's copy would answer this test's events with requests of its own.
  const added: Array<[string, EventListenerOrEventListenerObject]> = [];
  const realAdd = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type: string, listener: any, options?: any) => {
    added.push([type, listener]);
    realAdd(type, listener, options);
  });
  return () => {
    for (const [type, listener] of added) window.removeEventListener(type, listener);
  };
});

function loadAuth() {
  return import("@/lib/customerAuth");
}

/** Lets every answer already on its way arrive (none of them wait on a clock). */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("finding out who is signed in", () => {
  it("is nobody until the backend has answered, then the customer it names", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    const auth = await loadAuth();

    expect(auth.currentCustomer()).toBeNull();
    await settled();

    expect(auth.currentCustomer()).toEqual({ uid: "user-chiamaka-01", email: "chiamaka@example.com" });
  });

  it("asks the backend once, however many pages ask", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    const auth = await loadAuth();

    auth.currentCustomer();
    auth.currentCustomer();
    auth.onCustomerChange(() => {});
    await settled();
    auth.currentCustomer();
    await settled();

    expect(backend.sent("GET /api/auth/session")).toHaveLength(1);
  });

  it("tells a page nobody is signed in when the backend says so", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    const auth = await loadAuth();
    const told: unknown[] = [];

    auth.onCustomerChange((customer) => told.push(customer));
    await settled();

    expect(told).toEqual([null]);
  });

  it("treats an unreachable backend as signed out", async () => {
    backend.on("GET /api/auth/session", () => Promise.reject(new TypeError("fetch failed")));
    const auth = await loadAuth();
    const told: unknown[] = [];

    auth.onCustomerChange((customer) => told.push(customer));
    await settled();

    expect(told).toEqual([null]);
    expect(auth.currentCustomer()).toBeNull();
  });

  it("tells a page who is signed in once that is known", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    const auth = await loadAuth();
    const told: unknown[] = [];

    auth.onCustomerChange((customer) => told.push(customer));
    expect(told).toEqual([]);
    await settled();

    expect(told.length).toBeGreaterThanOrEqual(1);
    expect(told[told.length - 1]).toEqual({ uid: "user-chiamaka-01", email: "chiamaka@example.com" });
  });

  // A page that subscribed before the first check answered used to be told
  // twice (once as a "change", once as the first answer), so it loaded the
  // customer's profile twice.
  it("tells a waiting page exactly once when the first answer is a signed-in customer", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    const auth = await loadAuth();
    const told: unknown[] = [];

    auth.onCustomerChange((customer) => told.push(customer));
    await settled();

    expect(told).toHaveLength(1);
  });

  it("stops telling a page that has unsubscribed", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    backend.on("POST /api/auth/login", () => json(CHIAMAKA));
    const auth = await loadAuth();
    const told: unknown[] = [];

    const unsubscribe = auth.onCustomerChange((customer) => told.push(customer));
    unsubscribe();
    await settled();
    await auth.signIn("chiamaka@example.com", "correct horse");

    expect(told).toEqual([]);
  });

  it("clears the sign-in tokens the website kept before it used a cookie", async () => {
    localStorage.setItem("lodge.customerSession", JSON.stringify({ token: "old-token" }));
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    const auth = await loadAuth();

    auth.currentCustomer();

    expect(localStorage.getItem("lodge.customerSession")).toBeNull();
  });
});

describe("signing in", () => {
  it("with the right password signs the customer in and tells the page", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    backend.on("POST /api/auth/login", () => json(CHIAMAKA));
    const auth = await loadAuth();
    const told: unknown[] = [];
    auth.onCustomerChange((customer) => told.push(customer));
    await settled();

    const customer = await auth.signIn("chiamaka@example.com", "correct horse");

    expect(customer).toEqual({ uid: "user-chiamaka-01", email: "chiamaka@example.com" });
    expect(auth.currentCustomer()).toEqual(customer);
    expect(told).toEqual([null, customer]);
    expect(backend.sent("POST /api/auth/login")[0].body).toEqual({
      email: "chiamaka@example.com",
      password: "correct horse",
    });
  });

  it("lets other open tabs know, without putting anything secret in storage", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    backend.on("POST /api/auth/login", () => json(CHIAMAKA));
    const auth = await loadAuth();

    await auth.signIn("chiamaka@example.com", "correct horse");

    expect(localStorage.getItem("lodge.customerChanged")).not.toBeNull();
    const everythingStored = Object.keys(localStorage)
      .map((key) => `${key}=${localStorage.getItem(key)}`)
      .join("\n");
    expect(everythingStored).not.toContain("correct horse");
    expect(everythingStored).not.toContain("chiamaka@example.com");
  });

  it("with the wrong password stays signed out and passes on the backend's message", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    backend.on("POST /api/auth/login", () =>
      json({ error: "That email or password is not right.", code: "INVALID_CREDENTIALS" }, 401),
    );
    const auth = await loadAuth();
    const told: unknown[] = [];
    auth.onCustomerChange((customer) => told.push(customer));
    await settled();

    const attempt = auth.signIn("chiamaka@example.com", "wrong");

    await expect(attempt).rejects.toMatchObject({
      code: "auth/invalid-credential",
      message: "That email or password is not right.",
    });
    await settled();
    expect(auth.currentCustomer()).toBeNull();
    expect(told).toEqual([null]);
    expect(localStorage.getItem("lodge.customerChanged")).toBeNull();
  });

  it("names a blocked account, too many attempts and a lost connection so the page can explain", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    const auth = await loadAuth();

    backend.on("POST /api/auth/login", () => json({ error: "This account is blocked.", code: "ACCOUNT_DISABLED" }, 403));
    await expect(auth.signIn("a@example.com", "x")).rejects.toMatchObject({ code: "auth/user-disabled" });

    backend.on("POST /api/auth/login", () => json({ error: "Slow down.", code: "RATE_LIMITED" }, 429));
    await expect(auth.signIn("a@example.com", "x")).rejects.toMatchObject({ code: "auth/too-many-requests" });

    backend.on("POST /api/auth/login", () => Promise.reject(new TypeError("fetch failed")));
    await expect(auth.signIn("a@example.com", "x")).rejects.toMatchObject({
      code: "auth/network-request-failed",
      message: "Network error. Please check your connection.",
    });
  });

  it("gives a plain message when the backend fails without one", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    backend.on("POST /api/auth/login", () => new Response("Bad Gateway", { status: 502 }));
    const auth = await loadAuth();

    await expect(auth.signIn("a@example.com", "x")).rejects.toMatchObject({
      code: "auth/internal-error",
      message: "Something went wrong. Please try again.",
    });
  });
});

describe("creating an account", () => {
  it("signs the new customer in straight away", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    backend.on("POST /api/auth/signup", () => json({ userId: "user-new-07" }));
    const auth = await loadAuth();

    const customer = await auth.signUp("tunde@example.com", "a long password");

    // The backend sent no email back: the one typed is used.
    expect(customer).toEqual({ uid: "user-new-07", email: "tunde@example.com" });
    expect(auth.currentCustomer()).toEqual(customer);
  });

  it("names an email already in use and a weak password", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    const auth = await loadAuth();

    backend.on("POST /api/auth/signup", () => json({ error: "That email already has an account.", code: "EMAIL_IN_USE" }, 409));
    await expect(auth.signUp("tunde@example.com", "pw")).rejects.toMatchObject({ code: "auth/email-already-in-use" });

    backend.on("POST /api/auth/signup", () => json({ error: "Choose a longer password.", code: "WEAK_PASSWORD" }, 400));
    await expect(auth.signUp("tunde@example.com", "pw")).rejects.toMatchObject({ code: "auth/weak-password" });

    expect(auth.currentCustomer()).toBeNull();
  });

  it("removing an unfinished account signs the customer out", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    backend.on("DELETE /api/auth/account", () => json({ success: true }));
    const auth = await loadAuth();
    auth.currentCustomer();
    await settled();

    await auth.deleteUnfinishedAccount();

    expect(auth.currentCustomer()).toBeNull();
  });
});

describe("a session that ends", () => {
  it("signs the customer out when the backend refuses a request and no longer knows them", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    backend.on("GET /api/wallet", NOT_SIGNED_IN);
    const auth = await loadAuth();
    const { apiFetch } = await import("@/lib/apiClient");
    const told: unknown[] = [];
    auth.onCustomerChange((customer) => told.push(customer));
    await settled();
    expect(auth.currentCustomer()).not.toBeNull();

    // The session ended elsewhere: a password reset, or an admin block.
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    await apiFetch("/api/wallet");
    await settled();

    expect(auth.currentCustomer()).toBeNull();
    expect(told[told.length - 1]).toBeNull();
  });

  it("keeps the customer signed in when a refusal turns out not to be the session", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    backend.on("GET /api/wallet", NOT_SIGNED_IN);
    const auth = await loadAuth();
    const { apiFetch } = await import("@/lib/apiClient");
    auth.currentCustomer();
    await settled();

    await apiFetch("/api/wallet");
    await settled();

    expect(auth.currentCustomer()).toEqual({ uid: "user-chiamaka-01", email: "chiamaka@example.com" });
    // It did check again rather than assume.
    expect(backend.sent("GET /api/auth/session")).toHaveLength(2);
  });

  it("does not ask in a loop when the check itself is refused", async () => {
    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    const auth = await loadAuth();

    auth.currentCustomer();
    await settled();
    await settled();

    expect(backend.sent("GET /api/auth/session")).toHaveLength(1);
  });

  it("follows a sign-out made in another tab", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    const auth = await loadAuth();
    auth.currentCustomer();
    await settled();

    backend.on("GET /api/auth/session", NOT_SIGNED_IN);
    window.dispatchEvent(new StorageEvent("storage", { key: "lodge.customerChanged", newValue: "1" }));
    await settled();

    expect(auth.currentCustomer()).toBeNull();
  });

  it("ignores other things changing in storage", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    const auth = await loadAuth();
    auth.currentCustomer();
    await settled();

    window.dispatchEvent(new StorageEvent("storage", { key: "lodge:theme", newValue: "dark" }));
    await settled();

    expect(backend.sent("GET /api/auth/session")).toHaveLength(1);
  });
});

describe("signing out", () => {
  it("signs the customer out and tells the page and other tabs", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    backend.on("POST /api/auth/logout", () => json({ success: true }));
    const auth = await loadAuth();
    const told: unknown[] = [];
    auth.onCustomerChange((customer) => told.push(customer));
    await settled();

    await auth.signOut();

    expect(auth.currentCustomer()).toBeNull();
    expect(told[told.length - 1]).toBeNull();
    expect(backend.sent("POST /api/auth/logout")).toHaveLength(1);
    expect(localStorage.getItem("lodge.customerChanged")).not.toBeNull();
  });

  it("still signs out on this page when the backend can't be reached", async () => {
    backend.on("GET /api/auth/session", () => json(CHIAMAKA));
    backend.on("POST /api/auth/logout", () => Promise.reject(new TypeError("fetch failed")));
    const auth = await loadAuth();
    auth.currentCustomer();
    await settled();

    await auth.signOut();

    expect(auth.currentCustomer()).toBeNull();
  });
});

describe("confirming the password again", () => {
  it("sends the password and reports a wrong one", async () => {
    backend.on("POST /api/auth/reauth", () => json({ success: true }));
    const auth = await loadAuth();

    await expect(auth.confirmPassword("correct horse")).resolves.toBeUndefined();
    expect(backend.sent("POST /api/auth/reauth")[0].body).toEqual({ password: "correct horse" });

    backend.on("POST /api/auth/reauth", () => json({ error: "That password is not right.", code: "INVALID_CREDENTIALS" }, 401));
    await expect(auth.confirmPassword("wrong")).rejects.toMatchObject({ code: "auth/invalid-credential" });
  });
});
