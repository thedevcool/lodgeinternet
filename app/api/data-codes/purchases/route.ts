import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const hostel = request.nextUrl.searchParams.get("hostel") || "";
    const db = getAdminDb();

    let query = db.collection("dataPurchases").orderBy("purchasedAt", "desc") as FirebaseFirestore.Query;
    if (hostel) {
      query = db.collection("dataPurchases")
        .where("hostel", "==", hostel)
        .orderBy("purchasedAt", "desc");
    }

    const snapshot = await query.get();
    const purchases = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      purchasedAt: doc.data().purchasedAt?.toDate?.()?.toISOString() ?? null,
    }));

    return NextResponse.json({ purchases });
  } catch (error: any) {
    console.error("Error fetching purchases:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchases" },
      { status: 500 },
    );
  }
}
