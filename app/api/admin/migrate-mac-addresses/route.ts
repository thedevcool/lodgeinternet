import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  const migrationPassword = process.env.MIGRATION_PASSWORD;
  if (migrationPassword) {
    const provided = request.headers.get("x-migration-password");
    if (provided !== migrationPassword) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const db = getAdminDb();
    const snapshot = await db.collection("tvSubscriptions").get();

    let updatedCount = 0;
    const errors: string[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (data.macAddressHash && /^[a-f0-9]{64}$/.test(data.macAddressHash)) {
        try {
          await docSnap.ref.update({
            macAddressHash: null,
            migrationNote:
              "MAC address was hashed and cannot be recovered. Please ask user to provide MAC address again.",
            updatedAt: FieldValue.serverTimestamp(),
          });
          updatedCount++;
        } catch (error) {
          errors.push(`Failed to update subscription ${docSnap.id}: ${error}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration completed. Updated ${updatedCount} subscriptions.`,
      updatedCount,
      errors,
    });
  } catch (error: any) {
    console.error("Error migrating MAC addresses:", error);
    return NextResponse.json(
      { error: error.message || "Failed to migrate MAC addresses" },
      { status: 500 },
    );
  }
}
