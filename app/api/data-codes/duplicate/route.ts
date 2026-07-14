import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

/**
 * POST — Duplicate all plans and codes from one hostel to another.
 *
 * Body: { fromHostel: string, toHostel: string }
 *
 * For each plan belonging to `fromHostel`:
 *   1. Creates a new plan with hostelId = toHostel (same name, type, price, etc.)
 *   2. Copies all dataCodes for that plan+fromHostel to the new plan+toHostel
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fromHostel =
      typeof body.fromHostel === "string" ? body.fromHostel.trim() : "";
    const toHostel =
      typeof body.toHostel === "string" ? body.toHostel.trim() : "";

    if (!fromHostel || !toHostel) {
      return NextResponse.json(
        { error: "Both fromHostel and toHostel are required" },
        { status: 400 },
      );
    }

    if (fromHostel === toHostel) {
      return NextResponse.json(
        { error: "Source and destination hostels must be different" },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    // 1. Get all plans belonging to the source hostel
    const plansSnap = await db
      .collection("dataPlans")
      .where("hostelId", "==", fromHostel)
      .get();

    if (plansSnap.empty) {
      return NextResponse.json(
        { error: "No plans found for the source hostel" },
        { status: 404 },
      );
    }

    let totalPlans = 0;
    let totalCodes = 0;

    // Process each plan
    for (const planDoc of plansSnap.docs) {
      const planData = planDoc.data();
      const planName = planData.name || "";
      const planType = planData.planType || (planData.usersCount ? "device" : "tv");
      const planPrice = planData.price ?? 0;

      // Check if an identical plan already exists in the destination
      let existingQuery = db
        .collection("dataPlans")
        .where("hostelId", "==", toHostel)
        .where("name", "==", planName)
        .where("planType", "==", planType)
        .where("price", "==", planPrice);

      const existingPlan = await existingQuery.limit(1).get();

      let newPlanId: string;

      if (!existingPlan.empty) {
        // Plan already exists in destination — use it for codes
        newPlanId = existingPlan.docs[0].id;
      } else {
        // Create the plan in the destination hostel
        const newPlanData: Record<string, any> = {
          name: planName,
          planType,
          price: planPrice,
          hostelId: toHostel,
          isActive: planData.isActive ?? true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (planData.usersCount != null) newPlanData.usersCount = planData.usersCount;
        if (planData.duration != null) newPlanData.duration = planData.duration;
        if (planData.unlimitedPeriod) newPlanData.unlimitedPeriod = planData.unlimitedPeriod;

        const newPlanRef = await db.collection("dataPlans").add(newPlanData);
        newPlanId = newPlanRef.id;
        totalPlans++;
      }

      // 2. Get all codes for this plan + source hostel
      const codesSnap = await db
        .collection("dataCodes")
        .where("planId", "==", planDoc.id)
        .where("hostel", "==", fromHostel)
        .get();

      if (codesSnap.empty) continue;

      // Batch write codes (Firestore limit: 500 per batch)
      const BATCH_SIZE = 450;
      let batch = db.batch();
      let batchCount = 0;

      for (const codeDoc of codesSnap.docs) {
        const codeData = codeDoc.data();

        const newCodeRef = db.collection("dataCodes").doc();
        batch.set(newCodeRef, {
          planId: newPlanId,
          hostel: toHostel,
          codeHash: codeData.codeHash,
          codeMask: codeData.codeMask,
          encryptedCode: codeData.encryptedCode,
          createdAt: FieldValue.serverTimestamp(),
        });

        batchCount++;
        totalCodes++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      // Commit remaining
      if (batchCount > 0) {
        await batch.commit();
      }
    }

    return NextResponse.json({
      success: true,
      message: `Duplicated ${totalPlans} plan(s) and ${totalCodes} code(s) to "${toHostel}"`,
      plansCreated: totalPlans,
      codesCopied: totalCodes,
    });
  } catch (error: any) {
    console.error("Error duplicating plans/codes:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to duplicate plans and codes" },
      { status: 500 },
    );
  }
}
