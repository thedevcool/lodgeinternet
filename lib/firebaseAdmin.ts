import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore, FieldValue } from "firebase-admin/firestore";

export { FieldValue };

let adminApp: App | undefined;
let adminDb: Firestore | undefined;

function initAdmin() {
  if (adminApp) return { adminApp, adminDb: adminDb! };

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env.local",
    );
  }

  adminApp =
    getApps().length === 0
      ? initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        })
      : getApps()[0];

  adminDb = getFirestore(adminApp);
  return { adminApp, adminDb };
}

export function getAdminDb(): Firestore {
  const { adminDb } = initAdmin();
  return adminDb;
}

/**
 * Ensure the Admin SDK is initialised and return the app instance.
 * Used by modules that need `getAuth()` from `firebase-admin/auth`.
 */
export function getAdminApp(): App {
  const { adminApp } = initAdmin();
  return adminApp;
}
