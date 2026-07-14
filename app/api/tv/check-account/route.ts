import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const snap = await db.collection("tvSubscriptions")
      .where("email", "==", email)
      .limit(1)
      .get();

    return NextResponse.json({
      exists: !snap.empty,
      message: snap.empty ? "No account found" : "Account found",
    });
  } catch (error: any) {
    console.error("Error checking account:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check account" },
      { status: 500 },
    );
  }
}
