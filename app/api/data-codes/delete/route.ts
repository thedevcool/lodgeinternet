import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const codeId = typeof body.codeId === "string" ? body.codeId.trim() : "";
    const hostel = typeof body.hostel === "string" ? body.hostel.trim() : "";

    if (!codeId) {
      return NextResponse.json({ error: "Missing codeId" }, { status: 400 });
    }
    if (!hostel) {
      return NextResponse.json({ error: "Missing hostel" }, { status: 400 });
    }

    const db = getAdminDb();
    const codeDoc = await db.collection("dataCodes").doc(codeId).get();

    if (!codeDoc.exists) {
      return NextResponse.json({ error: "Code not found" }, { status: 404 });
    }

    if (codeDoc.data()!.hostel !== hostel) {
      return NextResponse.json(
        { error: "Code does not belong to this hostel" },
        { status: 403 },
      );
    }

    await codeDoc.ref.delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting data code:", error);
    return NextResponse.json(
      { error: "Failed to delete data code" },
      { status: 500 },
    );
  }
}
