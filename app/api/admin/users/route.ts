import { NextResponse } from "next/server";
import { getAdminDb, FieldValue, getAdminApp } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";

// ─── GET — list users OR fetch payment history for one user ─────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const historyUserId = searchParams.get("history") || "";

  // ── Payment history for a single user ─────────────────────────────────────
  if (historyUserId) {
    try {
      const db = getAdminDb();

      // Get the user's email first
      const userDoc = await db.collection("users").doc(historyUserId).get();
      if (!userDoc.exists) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const userEmail: string = (userDoc.data()?.email ?? "").toLowerCase();

      // Fetch from both collections in parallel
      const [dpSnap, tvSnap] = await Promise.all([
        db.collection("dataPurchases")
          .where("customerEmail", "==", userEmail)
          .orderBy("purchasedAt", "desc")
          .limit(50)
          .get(),
        db.collection("tvSubscriptions")
          .where("email", "==", userEmail)
          .orderBy("createdAt", "desc")
          .limit(50)
          .get(),
      ]);

      const purchases = [
        ...dpSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: "data" as const,
            planName: data.planName ?? data.plan ?? "—",
            planType: data.planType ?? "device",
            price: data.price ?? 0,
            paymentRef: data.paymentRef ?? data.paystackReference ?? "",
            hostel: data.hostel ?? "",
            createdAt: (data.purchasedAt ?? data.createdAt)?.toDate?.()?.toISOString() ?? null,
          };
        }),
        ...tvSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: "tv" as const,
            planName: data.planName ?? "—",
            planType: "tv" as const,
            price: data.price ?? 0,
            paymentRef: data.paymentRef ?? "",
            hostel: data.hostel ?? "",
            status: data.subscriptionStatus ?? "",
            createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
          };
        }),
      ].sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return NextResponse.json({ purchases });
    } catch (error: any) {
      console.error("[admin/users history GET]", error);
      return NextResponse.json({ error: error.message || "Failed to fetch history" }, { status: 500 });
    }
  }

  // ── User list ──────────────────────────────────────────────────────────────
  try {
    const hostel = searchParams.get("hostel") || "";
    const search = (searchParams.get("search") || "").toLowerCase().trim();

    const db = getAdminDb();

    // Fetch ALL users sorted by createdAt — no composite index needed.
    // Hostel + search filtering is done in-memory below.
    const usersSnap = await db.collection("users").orderBy("createdAt", "desc").get();

    // Build last-activity map (email → latest ISO date) from recent purchases
    const activityMap = new Map<string, string>();
    const [dpSnap, tvSnap] = await Promise.all([
      db.collection("dataPurchases").orderBy("createdAt", "desc").limit(500).get(),
      db.collection("tvSubscriptions").orderBy("createdAt", "desc").limit(500).get(),
    ]);

    for (const doc of dpSnap.docs) {
      const d = doc.data();
      const email: string = (d.customerEmail ?? d.email ?? "").toLowerCase();
      if (email && !activityMap.has(email)) {
        const ts = d.createdAt?.toDate?.()?.toISOString() ?? null;
        if (ts) activityMap.set(email, ts);
      }
    }
    for (const doc of tvSnap.docs) {
      const d = doc.data();
      const email: string = (d.email ?? "").toLowerCase();
      if (email && !activityMap.has(email)) {
        const ts = d.createdAt?.toDate?.()?.toISOString() ?? null;
        if (ts) activityMap.set(email, ts);
      }
    }

    let users = usersSnap.docs.map((doc) => {
      const d = doc.data();
      const email: string = d.email ?? "";
      return {
        id: doc.id,
        email,
        displayName: d.displayName ?? "",
        phone: d.phone ?? "",
        hostelId: d.hostelId ?? "",
        hostelSlug: d.hostelSlug ?? "",
        emailVerified: d.emailVerified ?? false,
        isActive: d.isActive !== false,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString() ?? null,
        lastActivityAt: activityMap.get(email) ?? null,
      };
    });

    // In-memory hostel filter (avoids composite index)
    if (hostel) {
      users = users.filter((u) => u.hostelId === hostel);
    }

    // In-memory search
    if (search) {
      users = users.filter(
        (u) =>
          u.email.includes(search) ||
          u.displayName.toLowerCase().includes(search) ||
          u.hostelId.toLowerCase().includes(search) ||
          u.phone.toLowerCase().includes(search),
      );
    }

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("[admin/users GET]", error);
    return NextResponse.json({ error: error.message || "Failed to fetch users" }, { status: 500 });
  }
}

// ─── DELETE — permanently remove a user and all their footprints ────────────
//
// Wipes: Firebase Auth account, Firestore users/{userId} profile, all
// tvSubscriptions for the user's email (or userId), and all dataPurchases
// keyed by their email. Returns counts of what was removed so the admin UI
// can surface what actually happened.

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bodyUserId = await request
      .json()
      .then((b) => (typeof b?.userId === "string" ? b.userId.trim() : ""))
      .catch(() => "");
    const userId = (searchParams.get("userId") || bodyUserId || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const db = getAdminDb();

    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userEmail: string = (userDoc.data()?.email ?? "").toLowerCase();

    const result = {
      firebaseAuthDeleted: false,
      tvSubscriptionsDeleted: 0,
      dataPurchasesDeleted: 0,
      profileDeleted: false,
    };

    // 1. Delete Firebase Auth account first — immediately invalidates active
    //    tokens so the user can't keep using the app while the wipe runs.
    try {
      const adminAuth = getAuth(getAdminApp());
      await adminAuth.deleteUser(userId);
      result.firebaseAuthDeleted = true;
    } catch (err: any) {
      // If the user is already gone from Auth (auth/user-not-found), proceed.
      // Otherwise log and continue — we still want to clean Firestore.
      if (err?.code !== "auth/user-not-found") {
        console.error("[admin/users DELETE] Firebase Auth delete failed:", err);
      }
    }

    // 2. Delete TV subscriptions — match by email AND userId, then dedupe.
    if (userEmail) {
      const [byEmail, byUid] = await Promise.all([
        db
          .collection("tvSubscriptions")
          .where("email", "==", userEmail)
          .get(),
        db.collection("tvSubscriptions").where("userId", "==", userId).get(),
      ]);
      const ids = new Set<string>();
      for (const doc of byEmail.docs) ids.add(doc.id);
      for (const doc of byUid.docs) ids.add(doc.id);

      const idArr = Array.from(ids);
      for (let i = 0; i < idArr.length; i += 400) {
        const batch = db.batch();
        for (const id of idArr.slice(i, i + 400)) {
          batch.delete(db.collection("tvSubscriptions").doc(id));
        }
        await batch.commit();
      }
      result.tvSubscriptionsDeleted = idArr.length;
    }

    // 3. Delete dataPurchases keyed by the user's email.
    if (userEmail) {
      const dpSnap = await db
        .collection("dataPurchases")
        .where("customerEmail", "==", userEmail)
        .get();

      const ids = dpSnap.docs.map((d) => d.id);
      for (let i = 0; i < ids.length; i += 400) {
        const batch = db.batch();
        for (const id of ids.slice(i, i + 400)) {
          batch.delete(db.collection("dataPurchases").doc(id));
        }
        await batch.commit();
      }
      result.dataPurchasesDeleted = ids.length;
    }

    // 4. Finally, delete the Firestore profile.
    await db.collection("users").doc(userId).delete();
    result.profileDeleted = true;

    return NextResponse.json({ success: true, userId, ...result });
  } catch (error: any) {
    console.error("[admin/users DELETE]", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete user" },
      { status: 500 },
    );
  }
}

// ─── PATCH — toggle isActive for a user ──────────────────────────────────────

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const isActive = typeof body.isActive === "boolean" ? body.isActive : null;

    if (!userId || isActive === null) {
      return NextResponse.json({ error: "userId and isActive (boolean) are required" }, { status: 400 });
    }

    const db = getAdminDb();

    await db.collection("users").doc(userId).update({
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Block / unblock in Firebase Auth immediately
    try {
      const adminAuth = getAuth(getAdminApp());
      await adminAuth.updateUser(userId, { disabled: !isActive });
    } catch (authErr) {
      console.error("[admin/users PATCH] Firebase Auth update failed:", authErr);
    }

    return NextResponse.json({ success: true, userId, isActive });
  } catch (error: any) {
    console.error("[admin/users PATCH]", error);
    return NextResponse.json({ error: error.message || "Failed to update user" }, { status: 500 });
  }
}
