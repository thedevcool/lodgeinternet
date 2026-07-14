import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { decryptMacAddress } from "@/lib/macAddressCrypto";
import { verifyAuth } from "@/lib/verifyAuth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const email = searchParams.get("email");
    const status = searchParams.get("status");
    const isAdmin = searchParams.get("isAdmin") === "true";

    const db = getAdminDb();

    // Non-admin callers must be authenticated and can only see their own subs
    let scopedEmail: string | null = null;
    let scopedUid: string | null = null;
    if (!isAdmin) {
      const auth = await verifyAuth(request);
      if (!auth.ok) {
        return NextResponse.json(
          { error: auth.error.message, code: auth.error.code },
          { status: 401 },
        );
      }
      scopedEmail = auth.user.email.toLowerCase();
      scopedUid = auth.user.uid;
    }

    let query = db.collection("tvSubscriptions").orderBy("createdAt", "desc") as FirebaseFirestore.Query;

    if (!isAdmin) {
      // Scope to caller — accept whichever of {userId, email} actually matches the auth subject.
      // Webhook-created rows have empty userId, so we fall back to email queries below.
      if (userId && userId === scopedUid) {
        query = db
          .collection("tvSubscriptions")
          .where("userId", "==", scopedUid)
          .orderBy("createdAt", "desc");
      } else {
        query = db
          .collection("tvSubscriptions")
          .where("email", "==", scopedEmail)
          .orderBy("createdAt", "desc");
      }
    } else if (userId) {
      query = db.collection("tvSubscriptions")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc");
    } else if (email) {
      query = db.collection("tvSubscriptions")
        .where("email", "==", email.toLowerCase())
        .orderBy("createdAt", "desc");
    } else if (status) {
      query = db.collection("tvSubscriptions")
        .where("subscriptionStatus", "==", status)
        .orderBy("createdAt", "desc");
    }

    const snapshot = await query.get();
    const subscriptions = snapshot.docs.map((doc) => {
      const data = doc.data();
      const subscription: any = {
        id: doc.id,
        ...data,
        paidAt: data.paidAt?.toDate?.()?.toISOString() ?? null,
        activatedAt: data.activatedAt?.toDate?.()?.toISOString() ?? null,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString() ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        hasMacAddress: !!data.macAddressHash,
      };

      if (isAdmin) {
        if (data.macAddressHash) {
          try {
            subscription.macAddress = decryptMacAddress(data.macAddressHash);
          } catch {
            subscription.macAddress = "Error decrypting (invalid format)";
          }
        } else if (data.migrationNote) {
          subscription.macAddress = "MAC address needs re-entry";
        } else {
          subscription.macAddress = "No MAC address stored";
        }
      }

      delete subscription.macAddressHash;
      return subscription;
    });

    return NextResponse.json({ subscriptions, count: subscriptions.length });
  } catch (error: any) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch subscriptions" },
      { status: 500 },
    );
  }
}
