import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const planId = typeof body.planId === "string" ? body.planId.trim() : "";
    const hostel = typeof body.hostel === "string" ? body.hostel.trim() : "";

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }
    if (!hostel) {
      return NextResponse.json({ error: "Missing hostel" }, { status: 400 });
    }

    const db = getAdminDb();

    // Delete all codes for this plan scoped to this hostel
    const codesSnap = await db.collection("dataCodes")
      .where("planId", "==", planId)
      .where("hostel", "==", hostel)
      .get();

    await Promise.all(codesSnap.docs.map((d) => d.ref.delete()));

    const planDoc = await db.collection("dataPlans").doc(planId).get();
    let planDeleted = false;

    if (planDoc.exists) {
      if (planDoc.data()!.hostelId === hostel) {
        // Plan belongs to this hostel — hard-delete it
        await planDoc.ref.delete();
        planDeleted = true;
      } else {
        // hostelId mismatch (legacy / shared plan) — soft-delete so users stop seeing it
        await planDoc.ref.update({
          isActive: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: planDeleted
        ? "Plan and all associated codes deleted successfully"
        : "Plan deactivated and all associated codes deleted.",
      deletedCodesCount: codesSnap.size,
      planDeleted,
    });
  } catch (error: any) {
    console.error("Error deleting plan:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete plan" },
      { status: 500 },
    );
  }
}
