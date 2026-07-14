import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 },
      );
    }

    // ── Super-admin (env vars) ──────────────────────────────────────────────
    if (username === adminUsername && password === adminPassword) {
      return NextResponse.json({
        success: true,
        username,
        isSuperAdmin: true,
        modulePermissions: [],
        hostels: [],
      });
    }

    // ── Sub-admin (Firestore) ───────────────────────────────────────────────
    const adminDb = getAdminDb();
    const snap = await adminDb
      .collection("adminUsers")
      .where("username", "==", username)
      .where("isActive", "==", true)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const adminData = snap.docs[0].data();
    const valid = await bcrypt.compare(password, adminData.passwordHash);

    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      username: adminData.username,
      isSuperAdmin: false,
      modulePermissions: adminData.modulePermissions ?? [],
      hostels: adminData.hostels ?? [],
      isPartner: adminData.isPartner ?? false,
      partnerSplitPercent: adminData.partnerSplitPercent ?? 0,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 },
    );
  }
}
