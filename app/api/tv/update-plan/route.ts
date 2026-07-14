import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const subscriptionId =
      typeof body.subscriptionId === "string" ? body.subscriptionId : "";
    const planId = typeof body.planId === "string" ? body.planId : "";

    if (!subscriptionId || !planId) {
      return NextResponse.json(
        { error: "subscriptionId and planId are required" },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    const planSnap = await db.collection("dataPlans").doc(planId).get();
    if (!planSnap.exists) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    const plan = planSnap.data()!;
    if (plan.planType !== "tv") {
      return NextResponse.json(
        { error: "Selected plan is not a TV plan" },
        { status: 400 },
      );
    }

    const subRef = db.collection("tvSubscriptions").doc(subscriptionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }
    const sub = subSnap.data()!;

    const update: Record<string, any> = {
      planId,
      planName: plan.name,
      duration: plan.duration,
      price: plan.price,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (sub.subscriptionStatus === "active" && sub.activatedAt) {
      const activatedAt: Date = sub.activatedAt.toDate();
      update.expiresAt = new Date(
        activatedAt.getTime() + plan.duration * 24 * 60 * 60 * 1000,
      );
    }

    await subRef.update(update);

    return NextResponse.json({ success: true, planName: plan.name as string });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
