import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

/**
 * PATCH /api/admin/waitlist/[id]
 *
 * Update the admin-controlled fields on a waitlist entry: status and notes.
 * Anything else in the body is ignored.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));

    const update: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };

    if (typeof body.status === "string") {
      const allowed = ["new", "contacted", "converted", "dismissed"];
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      update.status = body.status;
    }

    if (typeof body.notes === "string") {
      update.notes = body.notes;
    }

    if (Object.keys(update).length === 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("waitlist").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await ref.update(update);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[admin/waitlist PATCH]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update waitlist entry" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/waitlist/[id]
 *
 * Permanent delete — admin-only, no soft-delete. Used to scrub bad entries.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const db = getAdminDb();
    await db.collection("waitlist").doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[admin/waitlist DELETE]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete waitlist entry" },
      { status: 500 },
    );
  }
}
