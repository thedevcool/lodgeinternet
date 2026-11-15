/**
 * Guards store/authStore.ts: the admin console's sign-in state and its
 * permission checks.
 *
 * The backend decides what an admin may do; these helpers only decide what
 * the console shows. They still have to be right in both directions: a
 * superadmin must reach everything, and a module admin (say, someone who
 * only manages data codes at one hostel) must not be shown anything else.
 * The session itself is an HttpOnly cookie; the store keeps who is signed in
 * and when the session ends, and must forget both the moment it is over.
 *
 * The store restores itself from storage when it loads, so each test loads a
 * fresh copy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBackend, json, type FakeBackend } from "../../helpers/backend";
import { ADMIN_COOKIE_KEY, ADMIN_EXPIRES_KEY, ADMIN_PROFILE_KEY, OLD_ADMIN_TOKEN_KEY } from "@/lib/adminSession";
import type { AdminProfile } from "@/types";

const NOW = new Date("2026-11-15T10:00:00Z").getTime();
const IN_AN_HOUR_SECONDS = NOW / 1000 + 3600;

const SUPERADMIN: AdminProfile = {
  username: "davo",
  role: "super-admin",
  modulePermissions: [],
  hostels: [],
  isSuperAdmin: true,
};

/** Manages data codes (read and write) and may only look at transactions, at one hostel. */
const MODULE_ADMIN: AdminProfile = {
  username: "ngozi",
  role: "admin",
  modulePermissions: [
    { module: "data-codes", permission: "read-write" },
    { module: "transactions", permission: "read" },
    { module: "emails", permission: "write" },
  ],
  hostels: ["hostel-ayoni"],
  isSuperAdmin: false,
};

let backend: FakeBackend;
let storageListeners: Array<[string, EventListenerOrEventListenerObject]>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  backend = fakeBackend();
  vi.resetModules();

  // Each fresh copy of the store listens for storage changes; take those
  // listeners down so an earlier copy can't act on this test's events.
  storageListeners = [];
  const realAdd = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type: string, listener: any, options?: any) => {
    storageListeners.push([type, listener]);
    realAdd(type, listener, options);
  });

  return () => {
    for (const [type, listener] of storageListeners) window.removeEventListener(type, listener);
    document.cookie = `${ADMIN_COOKIE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    vi.useRealTimers();
  };
});

async function loadStore() {
  const { useAuthStore } = await import("@/store/authStore");
  return useAuthStore;
}

/** A store with this admin signed in. */
async function signedInAs(profile: AdminProfile | null) {
  const store = await loadStore();
  store.setState({ isAuthenticated: profile !== null, adminProfile: profile });
  return store.getState();
}

/** Lets every answer already on its way arrive. */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("what a superadmin may do", () => {
  it("reach, read and change every module", async () => {
    const admin = await signedInAs(SUPERADMIN);

    for (const module of ["data-codes", "transactions", "settings", "users", "controllers", "a-module-added-later"]) {
      expect(admin.canAccess(module), `open ${module}`).toBe(true);
      expect(admin.canRead(module), `read ${module}`).toBe(true);
      expect(admin.canWrite(module), `change ${module}`).toBe(true);
    }
  });

  it("see every hostel", async () => {
    const admin = await signedInAs(SUPERADMIN);

    expect(admin.canAccessHostel("hostel-ayoni")).toBe(true);
    expect(admin.canAccessHostel("hostel-anywhere-else")).toBe(true);
  });
});

describe("what a module admin may do", () => {
  it("open only the modules they were given", async () => {
    const admin = await signedInAs(MODULE_ADMIN);

    expect(admin.canAccess("data-codes")).toBe(true);
    expect(admin.canAccess("transactions")).toBe(true);
    expect(admin.canAccess("emails")).toBe(true);

    expect(admin.canAccess("settings")).toBe(false);
    expect(admin.canAccess("users")).toBe(false);
    expect(admin.canAccess("controllers")).toBe(false);
  });

  it("read and change a module they have full permission on", async () => {
    const admin = await signedInAs(MODULE_ADMIN);

    expect(admin.canRead("data-codes")).toBe(true);
    expect(admin.canWrite("data-codes")).toBe(true);
  });

  it("look at, but not change, a module they may only read", async () => {
    const admin = await signedInAs(MODULE_ADMIN);

    expect(admin.canRead("transactions")).toBe(true);
    expect(admin.canWrite("transactions")).toBe(false);
  });

  it("change, but not browse, a module they may only write to", async () => {
    const admin = await signedInAs(MODULE_ADMIN);

    expect(admin.canWrite("emails")).toBe(true);
    expect(admin.canRead("emails")).toBe(false);
  });

  it("neither read nor change a module they were not given", async () => {
    const admin = await signedInAs(MODULE_ADMIN);

    expect(admin.canRead("settings")).toBe(false);
    expect(admin.canWrite("settings")).toBe(false);
  });

  it("see only their own hostels", async () => {
    const admin = await signedInAs(MODULE_ADMIN);

    expect(admin.canAccessHostel("hostel-ayoni")).toBe(true);
    expect(admin.canAccessHostel("hostel-block-c")).toBe(false);
  });

  it("see every hostel when their list of hostels is empty (no restriction)", async () => {
    const admin = await signedInAs({ ...MODULE_ADMIN, hostels: [] });

    expect(admin.canAccessHostel("hostel-ayoni")).toBe(true);
    expect(admin.canAccessHostel("hostel-block-c")).toBe(true);
  });
});

describe("with nobody signed in", () => {
  it("nothing is allowed", async () => {
    const nobody = await signedInAs(null);

    expect(nobody.canAccess("data-codes")).toBe(false);
    expect(nobody.canRead("data-codes")).toBe(false);
    expect(nobody.canWrite("data-codes")).toBe(false);
    expect(nobody.canAccessHostel("hostel-ayoni")).toBe(false);
  });
});

describe("signing in to the admin console", () => {
  it("with the right password signs the admin in with the permissions the backend sent", async () => {
    backend.on("POST /api/admin/login", () =>
      json({
        success: true,
        username: "ngozi",
        isSuperAdmin: false,
        modulePermissions: MODULE_ADMIN.modulePermissions,
        hostels: ["hostel-ayoni"],
        expiresAt: IN_AN_HOUR_SECONDS,
      }),
    );
    const store = await loadStore();

    const ok = await store.getState().login("ngozi", "correct horse");

    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.adminProfile).toMatchObject({
      username: "ngozi",
      role: "admin",
      isSuperAdmin: false,
      hostels: ["hostel-ayoni"],
    });
    expect(state.canWrite("data-codes")).toBe(true);
    expect(state.canAccess("settings")).toBe(false);
  });

  it("remembers who is signed in and when the session ends, but never the password", async () => {
    backend.on("POST /api/admin/login", () =>
      json({ success: true, username: "davo", isSuperAdmin: true, expiresAt: IN_AN_HOUR_SECONDS }),
    );
    const store = await loadStore();

    await store.getState().login("davo", "correct horse");

    expect(localStorage.getItem(ADMIN_EXPIRES_KEY)).toBe(String(IN_AN_HOUR_SECONDS * 1000));
    expect(JSON.parse(localStorage.getItem(ADMIN_PROFILE_KEY)!)).toMatchObject({ username: "davo", role: "super-admin" });
    expect(document.cookie).toContain(`${ADMIN_COOKIE_KEY}=true`);
    const everythingStored = Object.keys(localStorage)
      .map((key) => `${key}=${localStorage.getItem(key)}`)
      .join("\n");
    expect(everythingStored + document.cookie).not.toContain("correct horse");
  });

  it("with the wrong password stays signed out and stores nothing", async () => {
    backend.on("POST /api/admin/login", () => json({ success: false, error: "Wrong username or password." }, 401));
    const store = await loadStore();

    const ok = await store.getState().login("ngozi", "wrong");

    expect(ok).toBe(false);
    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().adminProfile).toBeNull();
    expect(localStorage.getItem(ADMIN_EXPIRES_KEY)).toBeNull();
    expect(localStorage.getItem(ADMIN_PROFILE_KEY)).toBeNull();
  });

  it("stays signed out when the backend can't be reached", async () => {
    backend.on("POST /api/admin/login", () => Promise.reject(new TypeError("fetch failed")));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = await loadStore();

    const ok = await store.getState().login("ngozi", "correct horse");

    expect(ok).toBe(false);
    expect(store.getState().isAuthenticated).toBe(false);
    // The failure is logged, without the password.
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain("correct horse");
  });
});

describe("a page opened with an admin session already in the browser", () => {
  it("is signed in while the session has time left", async () => {
    localStorage.setItem(ADMIN_EXPIRES_KEY, String(NOW + 60_000));
    localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(MODULE_ADMIN));

    const store = await loadStore();

    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().adminProfile).toEqual(MODULE_ADMIN);
  });

  it("is signed out, with everything cleared, once the session's time has passed", async () => {
    localStorage.setItem(ADMIN_EXPIRES_KEY, String(NOW - 1));
    localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(SUPERADMIN));
    localStorage.setItem(ADMIN_COOKIE_KEY, "true");
    localStorage.setItem(OLD_ADMIN_TOKEN_KEY, "a-token-from-before-the-cookie");

    const store = await loadStore();

    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().adminProfile).toBeNull();
    for (const key of [ADMIN_EXPIRES_KEY, ADMIN_PROFILE_KEY, ADMIN_COOKIE_KEY, OLD_ADMIN_TOKEN_KEY]) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
  });

  it("is signed out when there is no session at all", async () => {
    const store = await loadStore();

    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().canAccess("data-codes")).toBe(false);
  });

  it("does not crash on a damaged stored profile, and allows nothing until it is renewed", async () => {
    localStorage.setItem(ADMIN_EXPIRES_KEY, String(NOW + 60_000));
    localStorage.setItem(ADMIN_PROFILE_KEY, "{not json");

    const store = await loadStore();

    expect(store.getState().adminProfile).toBeNull();
    expect(store.getState().canAccess("data-codes")).toBe(false);
    expect(store.getState().canWrite("settings")).toBe(false);
  });
});

describe("when the admin session ends", () => {
  it("forgets who was signed in and clears what the browser kept", async () => {
    backend.on("POST /api/admin/login", () =>
      json({ success: true, username: "davo", isSuperAdmin: true, expiresAt: IN_AN_HOUR_SECONDS }),
    );
    const store = await loadStore();
    await store.getState().login("davo", "correct horse");

    store.getState().endSession();

    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().adminProfile).toBeNull();
    expect(store.getState().canAccess("settings")).toBe(false);
    expect(localStorage.getItem(ADMIN_EXPIRES_KEY)).toBeNull();
    expect(localStorage.getItem(ADMIN_PROFILE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(`${ADMIN_COOKIE_KEY}=true`);
  });

  it("signing out tells the backend, as the admin console, and ends the session here at once", async () => {
    backend.on("POST /api/admin/logout", () => json({ success: true }));
    const store = await loadStore();
    store.setState({ isAuthenticated: true, adminProfile: SUPERADMIN });

    store.getState().logout();

    expect(store.getState().isAuthenticated).toBe(false);
    await settled();
    const [request] = backend.sent("POST /api/admin/logout");
    expect(request.headers.get("X-Lodge-Client")).toBe("admin");
  });

  it("signing out still ends the session here when the backend can't be reached", async () => {
    backend.on("POST /api/admin/logout", () => Promise.reject(new TypeError("fetch failed")));
    const store = await loadStore();
    store.setState({ isAuthenticated: true, adminProfile: SUPERADMIN });

    store.getState().logout();
    await settled();

    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().adminProfile).toBeNull();
  });

  it("follows a sign-out made in another tab", async () => {
    localStorage.setItem(ADMIN_EXPIRES_KEY, String(NOW + 60_000));
    localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(SUPERADMIN));
    const store = await loadStore();
    expect(store.getState().isAuthenticated).toBe(true);

    // The other tab cleared the session; this tab hears about it.
    localStorage.removeItem(ADMIN_EXPIRES_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: ADMIN_EXPIRES_KEY, newValue: null }));

    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().adminProfile).toBeNull();
  });
});

describe("renewing an admin session", () => {
  it("picks up the permissions as they are now, so a removed module stops showing", async () => {
    backend.on("POST /api/admin/refresh", () =>
      json({
        success: true,
        username: "ngozi",
        isSuperAdmin: false,
        modulePermissions: [{ module: "transactions", permission: "read" }],
        hostels: ["hostel-ayoni"],
        expiresAt: IN_AN_HOUR_SECONDS,
      }),
    );
    const store = await loadStore();
    store.setState({ isAuthenticated: true, adminProfile: MODULE_ADMIN });
    expect(store.getState().canWrite("data-codes")).toBe(true);

    const renewed = await store.getState().refresh();

    expect(renewed).toBe(true);
    expect(store.getState().canAccess("data-codes")).toBe(false);
    expect(store.getState().canRead("transactions")).toBe(true);
    expect(localStorage.getItem(ADMIN_EXPIRES_KEY)).toBe(String(IN_AN_HOUR_SECONDS * 1000));
    expect(backend.sent("POST /api/admin/refresh")[0].headers.get("X-Lodge-Client")).toBe("admin");
  });

  it("reports failure when the backend says the session is over", async () => {
    backend.on("POST /api/admin/refresh", () => json({ error: "Session expired.", code: "session_expired" }, 401));
    const store = await loadStore();
    store.setState({ isAuthenticated: true, adminProfile: MODULE_ADMIN });

    expect(await store.getState().refresh()).toBe(false);
  });

  it("keeps the admin signed in when the backend is only unreachable", async () => {
    backend.on("POST /api/admin/refresh", () => Promise.reject(new TypeError("fetch failed")));
    const store = await loadStore();
    store.setState({ isAuthenticated: true, adminProfile: MODULE_ADMIN });

    expect(await store.getState().refresh()).toBe(false);
    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().adminProfile).toEqual(MODULE_ADMIN);
  });
});
