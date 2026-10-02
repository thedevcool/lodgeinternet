"use client";

/**
 * Customer sign-in, without Firebase Auth.
 *
 * Firebase Auth is gone; the backend signs customers in itself
 * (`/api/auth/login`, `/signup`, `/refresh`, `/logout`, `/reauth`). This module
 * offers the same handful of functions the pages always called on
 * `firebase/auth` — `onAuthStateChanged`, `signInWithEmailAndPassword`,
 * `createUserWithEmailAndPassword`, `signOut`, `reauthenticateWithCredential`,
 * `user.getIdToken()` — with the same `auth/...` error codes, so each page
 * only changed its imports.
 *
 * The session (ID token, refresh token) is kept in localStorage, where
 * Firebase kept its own; tabs follow each other's sign-in and sign-out. An ID
 * token lasts an hour and is renewed with the refresh token when it nears
 * its end.
 *
 * Someone still signed in with Firebase from before the move is carried over
 * once, on their first visit, without having to sign in again (while Firebase
 * still answers; otherwise they simply sign in with their usual password).
 */

import { apiFetch } from "./apiClient";

const STORAGE_KEY = "lodge.customerSession";
// Renew an ID token this long before it runs out.
const RENEW_MARGIN_MS = 60_000;

type Session = {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
};

/** An error carrying a Firebase-style `code`, as the pages expect. */
export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const CODES: Record<string, string> = {
  INVALID_CREDENTIALS: "auth/invalid-credential",
  ACCOUNT_DISABLED: "auth/user-disabled",
  EMAIL_IN_USE: "auth/email-already-in-use",
  WEAK_PASSWORD: "auth/weak-password",
  INVALID_EMAIL: "auth/invalid-email",
  INVALID_REFRESH_TOKEN: "auth/user-token-expired",
  INVALID_TOKEN: "auth/user-token-expired",
};

async function post(path: string, body: object, idToken?: string, method = "POST"): Promise<any> {
  let response: Response;
  try {
    response = await apiFetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError("auth/network-request-failed", "Network error. Please check your connection.");
  }
  let data: any = {};
  try {
    data = await response.json();
  } catch {
    // no body
  }
  if (!response.ok) {
    const code = response.status === 429 ? "auth/too-many-requests" : CODES[data.code] ?? "auth/internal-error";
    throw new AuthError(code, data.error || "Something went wrong. Please try again.");
  }
  return data;
}

/** The signed-in customer, shaped like the Firebase user the pages used. */
export class User {
  readonly uid: string;
  readonly email: string | null;

  constructor(uid: string, email: string | null) {
    this.uid = uid;
    this.email = email;
  }

  /** A valid ID token; renewed first if it is about to run out (or `forceRefresh`). */
  getIdToken(forceRefresh = false): Promise<string> {
    return idToken(this.uid, forceRefresh);
  }

  /** Remove this account if registration never reached a profile (the
   * register page's clean-up after a failed step). */
  async delete(): Promise<void> {
    await post("/api/auth/account", {}, await this.getIdToken(), "DELETE");
    setSession(null);
  }
}

export type Auth = { currentUser: User | null };

const auth: Auth = { currentUser: null };
let session: Session | null = null;
const listeners = new Set<(user: User | null) => void>();
let ready: Promise<void> | null = null;
let renewing: Promise<string> | null = null;

function readStored(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeStored(value: Session | null): void {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode or storage full: the session lasts for this page only
  }
}

function adopt(value: Session | null): void {
  session = value;
  if (!value) auth.currentUser = null;
  else if (auth.currentUser?.uid !== value.uid) auth.currentUser = new User(value.uid, value.email);
}

function notify(): void {
  for (const listener of Array.from(listeners)) listener(auth.currentUser);
}

function setSession(value: Session | null): void {
  const before = auth.currentUser;
  adopt(value);
  writeStored(value);
  if (auth.currentUser !== before) notify();
}

function sessionFrom(data: any, previous?: Session | null): Session {
  return {
    uid: data.userId ?? previous?.uid,
    email: data.email ?? previous?.email ?? "",
    idToken: data.idToken,
    refreshToken: data.refreshToken ?? previous?.refreshToken,
    expiresAt: Date.now() + (Number(data.expiresIn) || 3600) * 1000,
  };
}

/** Carry a Firebase sign-in from before the move over to ours, once. */
async function carryOverFirebase(): Promise<void> {
  try {
    const { auth: firebaseAuth } = await import("./firebase");
    if (!firebaseAuth) return;
    const { onAuthStateChanged: onFirebase, signOut: firebaseSignOut } = await import("firebase/auth");
    const firebaseUser = await new Promise<any>((resolve) => {
      const timer = setTimeout(() => resolve(null), 4000);
      const unsubscribe = onFirebase(firebaseAuth, (user) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(user);
      });
    });
    if (!firebaseUser) return;
    const firebaseToken = await firebaseUser.getIdToken();
    const data = await post("/api/auth/session/firebase", { idToken: firebaseToken });
    setSession(sessionFrom(data));
    firebaseSignOut(firebaseAuth).catch(() => undefined);
  } catch {
    // Firebase gone or the session too old: they sign in again as usual.
  }
}

function init(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      const stored = readStored();
      if (stored) adopt(stored);
      else await carryOverFirebase();
    })();
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      const before = auth.currentUser;
      adopt(readStored());
      if (auth.currentUser !== before) notify();
    });
  }
  return ready;
}

async function idToken(uid: string, forceRefresh: boolean): Promise<string> {
  await init();
  if (!session || session.uid !== uid) {
    throw new AuthError("auth/no-current-user", "Please sign in again.");
  }
  if (!forceRefresh && session.expiresAt - Date.now() > RENEW_MARGIN_MS) return session.idToken;
  if (!renewing) {
    const current = session;
    renewing = post("/api/auth/refresh", { refreshToken: current.refreshToken })
      .then((data) => {
        setSession(sessionFrom(data, current));
        return data.idToken as string;
      })
      .catch((err) => {
        if (err instanceof AuthError && err.code === "auth/user-token-expired") setSession(null);
        throw err;
      })
      .finally(() => {
        renewing = null;
      });
  }
  return renewing;
}

// ─── The functions the pages call (Firebase's names and signatures) ──────────

export function getAuthInstance(): Auth {
  void init();
  return auth;
}

export function onAuthStateChanged(_auth: Auth, callback: (user: User | null) => void): () => void {
  listeners.add(callback);
  let active = true;
  void init().then(() => {
    if (active) callback(auth.currentUser);
  });
  return () => {
    active = false;
    listeners.delete(callback);
  };
}

export async function signInWithEmailAndPassword(_auth: Auth, email: string, password: string) {
  await init();
  const data = await post("/api/auth/login", { email, password });
  setSession(sessionFrom(data));
  return { user: auth.currentUser as User };
}

export async function createUserWithEmailAndPassword(_auth: Auth, email: string, password: string) {
  await init();
  const data = await post("/api/auth/signup", { email, password });
  setSession(sessionFrom({ ...data, email }));
  return { user: auth.currentUser as User };
}

export async function signOut(_auth: Auth): Promise<void> {
  await init();
  const previous = session;
  setSession(null);
  if (previous) post("/api/auth/logout", { refreshToken: previous.refreshToken }).catch(() => undefined);
}

export const EmailAuthProvider = {
  credential(email: string, password: string) {
    return { email, password };
  },
};

export async function reauthenticateWithCredential(user: User, credential: { email: string; password: string }) {
  const data = await post("/api/auth/reauth", { password: credential.password }, await user.getIdToken());
  if (session) setSession(sessionFrom(data, session));
  return { user };
}
