import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import { getAdminDb, getAdminApp } from "./firebaseAdmin";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum session age before re-authentication is required (24 hours) */
const MAX_SESSION_AGE_SECONDS = 24 * 60 * 60;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifiedUser {
  uid: string;
  email: string;
  /** User's locked hostel from Firestore profile */
  hostelId: string;
  hostelSlug: string;
  displayName: string;
  emailVerified: boolean;
  /** Seconds since the user last entered their password */
  sessionAge: number;
}

export type AuthError =
  | { code: "NO_TOKEN"; message: string }
  | { code: "INVALID_TOKEN"; message: string }
  | { code: "NO_PROFILE"; message: string }
  | { code: "EMAIL_NOT_VERIFIED"; message: string }
  | { code: "SESSION_EXPIRED"; message: string }
  | { code: "HOSTEL_MISMATCH"; message: string };

export type AuthResult =
  | { ok: true; user: VerifiedUser }
  | { ok: false; error: AuthError };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the Bearer token from an Authorization header or from the
 * request body's `idToken` field.
 */
function extractToken(request: Request, body?: any): string | null {
  // 1. Check Authorization header
  const authHeader =
    request.headers.get("authorization") ||
    request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // 2. Check body (for clients that send it in the payload)
  if (body?.idToken && typeof body.idToken === "string") {
    return body.idToken;
  }

  return null;
}

// ─── Main verification function ──────────────────────────────────────────────

interface VerifyOptions {
  /** If true, require a fresh session (< 24hrs). Default: false */
  requireFreshSession?: boolean;
  /** If provided, cross-check against the user's profile hostel */
  expectedHostel?: string;
}

/**
 * Verify a Firebase ID token and return the authenticated user's profile.
 *
 * This function:
 * 1. Extracts and verifies the Firebase ID token (cryptographic check)
 * 2. Loads the user's Firestore profile
 * 3. Checks email verification status
 * 4. Optionally checks session freshness (auth_time < 24hrs)
 * 5. Optionally cross-checks hostel against the user's locked hostel
 *
 * Use this at the top of any API route that needs authentication.
 */
export async function verifyAuth(
  request: Request,
  body?: any,
  options: VerifyOptions = {},
): Promise<AuthResult> {
  const { requireFreshSession = false, expectedHostel } = options;

  // 1. Extract token
  const token = extractToken(request, body);
  if (!token) {
    return {
      ok: false,
      error: {
        code: "NO_TOKEN",
        message: "Authentication required. Please sign in.",
      },
    };
  }

  // 2. Verify token with Firebase Admin (checks signature, expiry, issuer)
  let decoded: DecodedIdToken;
  try {
    // Ensure Admin SDK is initialised before calling getAuth()
    getAdminApp();
    decoded = await getAuth().verifyIdToken(token);
  } catch (err: any) {
    console.error("Token verification failed:", err.code || err.message);
    return {
      ok: false,
      error: {
        code: "INVALID_TOKEN",
        message:
          err.code === "auth/id-token-expired"
            ? "Your session has expired. Please sign in again."
            : "Invalid authentication token. Please sign in again.",
      },
    };
  }

  // 3. Check session age (auth_time = last time user entered password)
  const sessionAge = Math.floor(Date.now() / 1000) - (decoded.auth_time || 0);

  if (requireFreshSession && sessionAge > MAX_SESSION_AGE_SECONDS) {
    return {
      ok: false,
      error: {
        code: "SESSION_EXPIRED",
        message:
          "Your session is older than 24 hours. Please re-enter your password to continue.",
      },
    };
  }

  // 4. Load Firestore profile
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(decoded.uid).get();

  if (!userDoc.exists) {
    return {
      ok: false,
      error: {
        code: "NO_PROFILE",
        message:
          "Account profile not found. Please complete registration first.",
      },
    };
  }

  const profile = userDoc.data()!;

  // 5. Check email verification
  if (!profile.emailVerified) {
    return {
      ok: false,
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before making purchases.",
      },
    };
  }

  // 6. Cross-check hostel if requested
  if (expectedHostel && profile.hostelId !== expectedHostel) {
    return {
      ok: false,
      error: {
        code: "HOSTEL_MISMATCH",
        message: `You can only purchase plans for your registered hostel (${profile.hostelId}).`,
      },
    };
  }

  return {
    ok: true,
    user: {
      uid: decoded.uid,
      email: profile.email || decoded.email || "",
      hostelId: profile.hostelId,
      hostelSlug: profile.hostelSlug,
      displayName: profile.displayName || "",
      emailVerified: profile.emailVerified,
      sessionAge,
    },
  };
}

/**
 * HTTP status code for an auth error.
 */
export function authErrorStatus(error: AuthError): number {
  switch (error.code) {
    case "NO_TOKEN":
    case "INVALID_TOKEN":
      return 401;
    case "SESSION_EXPIRED":
      return 403;
    case "NO_PROFILE":
    case "EMAIL_NOT_VERIFIED":
      return 403;
    case "HOSTEL_MISMATCH":
      return 403;
    default:
      return 401;
  }
}
