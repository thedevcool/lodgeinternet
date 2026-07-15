import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

// ─── PATCH — update a sub-admin ───────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Invalid admin ID" }, { status: 400 });
  }

  let body: {
    email?: string;
    whatsappPhone?: string;
    password?: string;
    modulePermissions?: Array<{ module: string; permission: string }>;
    hostels?: string[];
    isActive?: boolean;
    isPartner?: boolean;
    partnerSplitPercent?: number;
    partnerSplitMode?: string;
    partnerHostelSplits?: Record<string, number>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (body.email !== undefined) updates.email = body.email;
  if (body.whatsappPhone !== undefined) updates.whatsappPhone = body.whatsappPhone;
  if (body.modulePermissions !== undefined)
    updates.modulePermissions = body.modulePermissions;
  if (body.hostels !== undefined) updates.hostels = body.hostels;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.isPartner !== undefined) updates.isPartner = body.isPartner;
  if (body.partnerSplitPercent !== undefined) {
    if (
      typeof body.partnerSplitPercent !== "number" ||
      body.partnerSplitPercent < 0 ||
      body.partnerSplitPercent > 100
    ) {
      return NextResponse.json(
        { error: "Partner split must be between 0 and 100" },
        { status: 400 },
      );
    }
    updates.partnerSplitPercent = body.partnerSplitPercent;
  }
  if (body.partnerSplitMode !== undefined) {
    updates.partnerSplitMode =
      body.partnerSplitMode === "perHostel" ? "perHostel" : "whole";
  }
  if (body.partnerHostelSplits !== undefined) {
    const cleaned: Record<string, number> = {};
    for (const [hostelId, pct] of Object.entries(body.partnerHostelSplits)) {
      const n = Number(pct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json(
          { error: "Each hostel split must be between 0 and 100" },
          { status: 400 },
        );
      }
      cleaned[hostelId] = n;
    }
    updates.partnerHostelSplits = cleaned;
  }

  if (body.password) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }
    updates.passwordHash = await bcrypt.hash(body.password, 12);
  }

  try {
    const db = getAdminDb();
    await db.collection("adminUsers").doc(id).update(updates);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[admins PATCH]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── DELETE — remove a sub-admin ─────────────────────────────────────────────
export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Invalid admin ID" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    await db.collection("adminUsers").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[admins DELETE]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
