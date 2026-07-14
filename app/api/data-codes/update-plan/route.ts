import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const planId = typeof body.planId === "string" ? body.planId.trim() : "";

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    const db = getAdminDb();
    const planDoc = await db.collection("dataPlans").doc(planId).get();

    if (!planDoc.exists) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const current = planDoc.data()!;
    const updateData: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json(
          { error: "Plan name cannot be empty" },
          { status: 400 },
        );
      }
      updateData.name = name;
    }

    if (body.price !== undefined) {
      const price = Number(body.price);
      if (isNaN(price) || price <= 0) {
        return NextResponse.json(
          { error: "Price must be a positive number" },
          { status: 400 },
        );
      }
      updateData.price = price;
    }

    if (body.usersCount !== undefined) {
      const usersCount = Number(body.usersCount);
      updateData.usersCount = usersCount > 0 ? usersCount : undefined;
    }

    if (body.duration !== undefined) {
      const duration = Number(body.duration);
      updateData.duration = duration > 0 ? duration : undefined;
    }

    if (body.unlimitedPeriod !== undefined) {
      const unlimitedPeriod =
        typeof body.unlimitedPeriod === "string"
          ? body.unlimitedPeriod.trim()
          : "";
      updateData.unlimitedPeriod = unlimitedPeriod || undefined;
    }

    if (body.planType !== undefined) {
      const planType =
        body.planType === "tv"
          ? "tv"
          : body.planType === "unlimited"
            ? "unlimited"
            : "device";
      updateData.planType = planType;
    }

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    await planDoc.ref.update(updateData);

    const updated = await planDoc.ref.get();
    const d = updated.data()!;

    return NextResponse.json({
      plan: {
        id: updated.id,
        name: d.name ?? "",
        planType: d.planType ?? "device",
        price: d.price ?? 0,
        usersCount: d.usersCount ?? undefined,
        duration: d.duration ?? undefined,
        unlimitedPeriod: d.unlimitedPeriod ?? undefined,
        hostelId: d.hostelId ?? "",
        isActive: d.isActive ?? true,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString() ?? null,
      } as any,
    });
  } catch (error: any) {
    console.error("Error updating plan:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update plan" },
      { status: 500 },
    );
  }
}
