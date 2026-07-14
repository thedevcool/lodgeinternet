import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

/**
 * ONE-TIME MIGRATION: Replaces "daily-unlimited" with "unlimited" across Firestore.
 *
 * Collections updated:
 *   - hostels       → planTypes array
 *   - dataPlans     → planType field
 *   - dataPurchases → planType field
 */
export async function POST(request: Request) {
  // ── Migration password check ───────────────────────────────────────────────
  const migrationPassword = process.env.MIGRATION_PASSWORD;
  if (migrationPassword) {
    const provided = request.headers.get("x-migration-password");
    if (provided !== migrationPassword) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const db = getAdminDb();
    const results = { hostels: 0, dataPlans: 0, dataPurchases: 0 };

    // 1. Hostels — update planTypes arrays
    const hostelsSnap = await db.collection("hostels").get();
    for (const doc of hostelsSnap.docs) {
      const planTypes: string[] | undefined = doc.data().planTypes;
      if (planTypes && planTypes.includes("daily-unlimited")) {
        const updated = planTypes.map((pt) =>
          pt === "daily-unlimited" ? "unlimited" : pt,
        );
        await doc.ref.update({ planTypes: updated });
        results.hostels++;
      }
    }

    // 2. dataPlans — update planType and backfill unlimitedPeriod
    const plansSnap = await db
      .collection("dataPlans")
      .where("planType", "==", "daily-unlimited")
      .get();
    for (const doc of plansSnap.docs) {
      await doc.ref.update({ planType: "unlimited", unlimitedPeriod: "daily" });
      results.dataPlans++;
    }

    // 2b. dataPlans already "unlimited" but missing unlimitedPeriod
    const unlimitedSnap = await db
      .collection("dataPlans")
      .where("planType", "==", "unlimited")
      .get();
    for (const doc of unlimitedSnap.docs) {
      if (!doc.data().unlimitedPeriod) {
        await doc.ref.update({ unlimitedPeriod: "daily" });
        results.dataPlans++;
      }
    }

    // 3. dataPurchases — update planType field
    const purchasesSnap = await db
      .collection("dataPurchases")
      .where("planType", "==", "daily-unlimited")
      .get();
    for (const doc of purchasesSnap.docs) {
      await doc.ref.update({ planType: "unlimited" });
      results.dataPurchases++;
    }

    return NextResponse.json({
      message: "Migration complete — all 'daily-unlimited' values replaced with 'unlimited'",
      ...results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Migration failed" },
      { status: 500 },
    );
  }
}
