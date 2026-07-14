import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── GET — list all sub-admins ────────────────────────────────────────────────
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("adminUsers")
      .orderBy("createdAt", "desc")
      .get();

    const admins = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        username: d.username,
        email: d.email ?? "",
        whatsappPhone: d.whatsappPhone ?? "",
        role: d.role,
        modulePermissions: d.modulePermissions ?? [],
        hostels: d.hostels ?? [],
        isActive: d.isActive,
        isPartner: d.isPartner ?? false,
        createdBy: d.createdBy ?? "",
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ admins });
  } catch (err: any) {
    console.error("[admins GET]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST — create a new sub-admin ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  let body: {
    username: string;
    email?: string;
    whatsappPhone?: string;
    password: string;
    modulePermissions: Array<{ module: string; permission: string }>;
    hostels: string[];
    createdBy: string;
    isPartner?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { username, email, whatsappPhone, password, modulePermissions, hostels, createdBy, isPartner } =
    body;

  if (!username?.trim()) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 },
    );
  }
  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 },
    );
  }
  if (!modulePermissions?.length) {
    return NextResponse.json(
      { error: "At least one module permission must be granted" },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();

    // Duplicate username check
    const dupSnap = await db
      .collection("adminUsers")
      .where("username", "==", username.trim())
      .get();
    if (!dupSnap.empty) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.collection("adminUsers").add({
      username: username.trim(),
      email: email?.trim() ?? "",
      whatsappPhone: whatsappPhone?.trim() ?? "",
      passwordHash,
      role: "admin",
      modulePermissions,
      hostels: hostels ?? [],
      isActive: true,
      createdBy: createdBy ?? "",
      isPartner: isPartner ?? false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[admins POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
