import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const group = searchParams.get("group") || "all";
  const hostel = searchParams.get("hostel") || "";

  const emailSet = new Map<string, string>(); // email → name

  try {
    const db = getAdminDb();

    if (group === "all" || group === "tv-users") {
      const tvSnap = await db.collection("tvSubscriptions").get();
      for (const doc of tvSnap.docs) {
        const data = doc.data();
        const email: string = data.email?.toLowerCase?.() ?? "";
        if (!email || !email.includes("@")) continue;
        if (hostel && data.hostel !== hostel) continue;
        emailSet.set(email, data.name ?? "");
      }
    }

    if (group === "all" || group === "data-users") {
      const dpSnap = await db.collection("dataPurchases").get();
      for (const doc of dpSnap.docs) {
        const data = doc.data();
        const email: string = (data.customerEmail ?? data.email)?.toLowerCase?.() ?? "";
        if (!email || !email.includes("@") || email === "n/a") continue;
        if (hostel && data.hostel !== hostel) continue;
        if (!emailSet.has(email)) emailSet.set(email, data.name ?? "");
      }
    }

    const recipients = Array.from(emailSet.entries()).map(([email, name]) => ({ email, name }));
    return NextResponse.json({ recipients });
  } catch (error: any) {
    console.error("[get-email-recipients]", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch recipients" },
      { status: 500 },
    );
  }
}
