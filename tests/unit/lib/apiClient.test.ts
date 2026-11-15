/**
 * Guards lib/apiClient.ts: the one place that decides where an `/api/...`
 * request goes and which part of the site it says it is.
 *
 * Sign-ins are HttpOnly cookies, and the backend only honours a cookie when
 * the X-Lodge-Client header names the side it belongs to. Two rules matter
 * most here:
 *  - `apiFetch` (customer pages) must never say "admin". It once did, and a
 *    browser with an admin signed in was sent hostel Wi-Fi passwords on the
 *    customer registration page.
 *  - a refused request (401) must be announced, so no page sits silently
 *    empty after a session ends.
 *
 * The API base is read once when the module loads, so each test loads a
 * fresh copy after setting NEXT_PUBLIC_API_BASE_URL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBackend, json, type FakeBackend } from "../../helpers/backend";
import { SESSION_ENDED_EVENT } from "@/lib/adminSession";

async function loadClient(apiBase = "") {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", apiBase);
  vi.resetModules();
  return import("@/lib/apiClient");
}

/** Collects the events fired on `window` under `name` until the test ends. */
function listenFor(name: string): Event[] {
  const seen: Event[] = [];
  const listener = (event: Event) => seen.push(event);
  window.addEventListener(name, listener);
  cleanups.push(() => window.removeEventListener(name, listener));
  return seen;
}

let cleanups: Array<() => void> = [];
let backend: FakeBackend;

beforeEach(() => {
  backend = fakeBackend();
  cleanups = [];
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
});

describe("where a request goes", () => {
  it("sends /api paths to the configured backend", async () => {
    const { apiUrl } = await loadClient("https://api.lodge.test");
    expect(apiUrl("/api/data-plans?hostel=Ayoni")).toBe("https://api.lodge.test/api/data-plans?hostel=Ayoni");
    expect(apiUrl("/api")).toBe("https://api.lodge.test/api");
  });

  it("ignores trailing slashes on the configured backend address", async () => {
    const { apiUrl } = await loadClient("https://api.lodge.test///");
    expect(apiUrl("/api/hostels")).toBe("https://api.lodge.test/api/hostels");
  });

  it("leaves paths outside /api on the website itself", async () => {
    const { apiUrl } = await loadClient("https://api.lodge.test");
    expect(apiUrl("/blog")).toBe("/blog");
    expect(apiUrl("/legal/privacy")).toBe("/legal/privacy");
  });

  it("stays same-origin when no backend is configured", async () => {
    const { apiUrl } = await loadClient("");
    expect(apiUrl("/api/hostels")).toBe("/api/hostels");
  });

  it("fetches from the configured backend", async () => {
    const { apiFetch, adminFetch } = await loadClient("https://api.lodge.test");
    backend.on("GET /api/hostels", () => json({ hostels: [] }));
    backend.on("GET /api/admin/analytics", () => json({}));

    await apiFetch("/api/hostels");
    await adminFetch("/api/admin/analytics");

    expect(backend.requests.map((r) => r.url)).toEqual([
      "https://api.lodge.test/api/hostels",
      "https://api.lodge.test/api/admin/analytics",
    ]);
  });
});

describe("customer requests (apiFetch)", () => {
  it("carry the sign-in cookies and say they come from the site", async () => {
    const { apiFetch } = await loadClient();
    backend.on("GET /api/wallet", () => json({ available: false }));

    await apiFetch("/api/wallet");

    const [request] = backend.sent("GET /api/wallet");
    expect(request.credentials).toBe("include");
    expect(request.headers.get("X-Lodge-Client")).toBe("site");
  });

  it("keep the caller's method, headers and body", async () => {
    const { apiFetch } = await loadClient();
    backend.on("POST /api/data-codes/reserve", () => json({ reservationId: "held-1" }));

    await apiFetch("/api/data-codes/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "weekly-3", hostel: "Ayoni Block A" }),
    });

    const [request] = backend.sent("POST /api/data-codes/reserve");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(request.headers.get("X-Lodge-Client")).toBe("site");
    expect(request.credentials).toBe("include");
    expect(request.body).toEqual({ planId: "weekly-3", hostel: "Ayoni Block A" });
  });

  it("never identify as admin, even when the caller asks for it", async () => {
    const { apiFetch } = await loadClient();
    backend.on("GET /api/hostels", () => json({ hostels: [] }));

    await apiFetch("/api/hostels", { headers: { "X-Lodge-Client": "admin" } });
    await apiFetch("/api/hostels", { headers: { "x-lodge-client": "admin" } });
    await apiFetch("/api/hostels", { headers: new Headers({ "X-Lodge-Client": "admin" }), credentials: "omit" });

    for (const request of backend.sent("GET /api/hostels")) {
      expect(request.headers.get("X-Lodge-Client")).toBe("site");
      expect(request.credentials).toBe("include");
    }
  });

  it("announce a refused (401) request so the sign-in state can check itself", async () => {
    const { apiFetch, CUSTOMER_REFUSED_EVENT } = await loadClient();
    const refused = listenFor(CUSTOMER_REFUSED_EVENT);
    const adminEnded = listenFor(SESSION_ENDED_EVENT);
    backend.on("GET /api/wallet", () => json({ error: "Please sign in.", code: "NOT_SIGNED_IN" }, 401));

    const response = await apiFetch("/api/wallet");

    expect(response.status).toBe(401);
    expect(refused).toHaveLength(1);
    // A customer's 401 is not an admin session ending.
    expect(adminEnded).toHaveLength(0);
  });

  it("hand the refused response back unread, so the page can still read the message", async () => {
    const { apiFetch } = await loadClient();
    backend.on("GET /api/wallet", () => json({ error: "Please sign in.", code: "NOT_SIGNED_IN" }, 401));

    const response = await apiFetch("/api/wallet");

    expect(await response.json()).toEqual({ error: "Please sign in.", code: "NOT_SIGNED_IN" });
  });

  it("stay quiet for every other answer", async () => {
    const { apiFetch, CUSTOMER_REFUSED_EVENT } = await loadClient();
    const refused = listenFor(CUSTOMER_REFUSED_EVENT);
    backend.on("GET /api/ok", () => json({}));
    backend.on("GET /api/forbidden", () => json({ error: "Not allowed." }, 403));
    backend.on("GET /api/sold-out", () => json({ error: "No codes left." }, 409));
    backend.on("GET /api/broken", () => json({ error: "Something went wrong." }, 500));

    for (const path of ["/api/ok", "/api/forbidden", "/api/sold-out", "/api/broken"]) await apiFetch(path);

    expect(refused).toHaveLength(0);
  });
});

describe("admin requests (adminFetch)", () => {
  it("carry the sign-in cookies and say they come from the admin console", async () => {
    const { adminFetch } = await loadClient();
    backend.on("POST /api/admin/refresh", () => json({ success: true }));

    await adminFetch("/api/admin/refresh", { method: "POST" });

    const [request] = backend.sent("POST /api/admin/refresh");
    expect(request.credentials).toBe("include");
    expect(request.headers.get("X-Lodge-Client")).toBe("admin");
  });

  it("announce an expired session once when a request is refused (401)", async () => {
    const { adminFetch, CUSTOMER_REFUSED_EVENT } = await loadClient();
    const ended = listenFor(SESSION_ENDED_EVENT);
    const customerRefused = listenFor(CUSTOMER_REFUSED_EVENT);
    backend.on("GET /api/admin/analytics", () => json({ error: "Session expired.", code: "session_expired" }, 401));

    const response = await adminFetch("/api/admin/analytics");

    expect(ended).toHaveLength(1);
    expect((ended[0] as CustomEvent).detail).toBe("expired");
    expect(customerRefused).toHaveLength(0);
    // The page can still read the answer after the client looked at its code.
    expect(await response.json()).toEqual({ error: "Session expired.", code: "session_expired" });
  });

  it("say the session was revoked when the backend calls it invalid", async () => {
    const { adminFetch } = await loadClient();
    const ended = listenFor(SESSION_ENDED_EVENT);
    backend.on("GET /api/admin/analytics", () => json({ error: "Signed out.", code: "session_invalid" }, 401));

    await adminFetch("/api/admin/analytics");

    expect(ended).toHaveLength(1);
    expect((ended[0] as CustomEvent).detail).toBe("invalid");
  });

  it("treat a 401 without a readable body as a plain expiry", async () => {
    const { adminFetch } = await loadClient();
    const ended = listenFor(SESSION_ENDED_EVENT);
    backend.on("GET /api/admin/analytics", () => new Response("<html>Unauthorized</html>", { status: 401 }));

    await adminFetch("/api/admin/analytics");

    expect(ended).toHaveLength(1);
    expect((ended[0] as CustomEvent).detail).toBe("expired");
  });

  it("leave a 403 alone: the session is fine, this admin just may not do that", async () => {
    const { adminFetch } = await loadClient();
    const ended = listenFor(SESSION_ENDED_EVENT);
    backend.on("GET /api/admin/settlements", () => json({ error: "Superadmin only." }, 403));
    backend.on("GET /api/admin/analytics", () => json({}));

    await adminFetch("/api/admin/settlements");
    await adminFetch("/api/admin/analytics");

    expect(ended).toHaveLength(0);
  });
});
