import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { generatePaymentRef } from "@/lib/generateRef";

// POST /api/admin/migrate-hostel
// Assigns hostel: "Ayoni" to all dataPurchases and tvSubscriptions
// that are missing the hostel field (i.e. created before hostel tracking was added).
export async function POST(request: Request) {
  const migrationPassword = process.env.MIGRATION_PASSWORD;
  if (migrationPassword) {
    const provided = request.headers.get("x-migration-password");
    if (provided !== migrationPassword) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const db = getAdminDb();
    let dataCodesUpdated = 0;
    let dataPurchasesUpdated = 0;
    let tvSubscriptionsUpdated = 0;
    const errors: string[] = [];

    // --- dataCodes ---
    const dcSnap = await db.collection("dataCodes").get();
    for (const docSnap of dcSnap.docs) {
      const data = docSnap.data();
      if (!data.hostel || data.hostel === "") {
        try {
          await docSnap.ref.update({ hostel: "Ayoni" });
          dataCodesUpdated++;
        } catch (err) {
          errors.push(`dataCodes/${docSnap.id}: ${err}`);
        }
      }
    }

    // --- dataPurchases ---
    const dpSnap = await db.collection("dataPurchases").get();
    for (const docSnap of dpSnap.docs) {
      const data = docSnap.data();
      const needsHostel = !data.hostel || data.hostel === "N/A";
      const needsRef = !data.paymentRef || data.paymentRef === "N/A";

      if (needsHostel || needsRef) {
        try {
          const hostel = needsHostel ? "Ayoni" : data.hostel;
          const planType = data.planType || "device";
          const date = data.purchasedAt?.toDate?.() ?? new Date();
          const updates: Record<string, unknown> = {};
          if (needsHostel) updates.hostel = hostel;
          if (needsRef) updates.paymentRef = generatePaymentRef(hostel, planType, date);
          await docSnap.ref.update(updates);
          dataPurchasesUpdated++;
        } catch (err) {
          errors.push(`dataPurchases/${docSnap.id}: ${err}`);
        }
      }
    }

    // --- tvSubscriptions ---
    const tvSnap = await db.collection("tvSubscriptions").get();
    for (const docSnap of tvSnap.docs) {
      const data = docSnap.data();
      const needsHostel = !data.hostel || data.hostel === "N/A";
      const needsRef = !data.paymentRef || data.paymentRef === "N/A";

      if (needsHostel || needsRef) {
        try {
          const hostel = needsHostel ? "Ayoni" : data.hostel;
          const date = data.paidAt?.toDate?.() ?? data.createdAt?.toDate?.() ?? new Date();
          const updates: Record<string, unknown> = {};
          if (needsHostel) updates.hostel = hostel;
          if (needsRef) updates.paymentRef = generatePaymentRef(hostel, "tv", date);
          await docSnap.ref.update(updates);
          tvSubscriptionsUpdated++;
        } catch (err) {
          errors.push(`tvSubscriptions/${docSnap.id}: ${err}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration complete. Updated ${dataCodesUpdated} data codes, ${dataPurchasesUpdated} data purchases and ${tvSubscriptionsUpdated} TV subscriptions.`,
      dataCodesUpdated,
      dataPurchasesUpdated,
      tvSubscriptionsUpdated,
      errors,
    });
  } catch (error: any) {
    console.error("Error migrating hostel field:", error);
    return NextResponse.json(
      { error: error.message || "Migration failed" },
      { status: 500 },
    );
  }
}
