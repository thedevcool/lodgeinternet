import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — list all drafts
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("emailDrafts").orderBy("updatedAt", "desc").get();
    const drafts = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
    }));
    return NextResponse.json({ drafts });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch drafts" },
      { status: 500 },
    );
  }
}

// POST — create a new draft
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const html = typeof body.html === "string" ? body.html : "";

    if (!subject) {
      return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const created = await db.collection("emailDrafts").add({
      subject,
      html,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: created.id, message: "Draft saved" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save draft" },
      { status: 500 },
    );
  }
}

// PUT — update a draft
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const html = typeof body.html === "string" ? body.html : "";

    if (!id || !subject) {
      return NextResponse.json({ error: "ID and subject are required" }, { status: 400 });
    }

    const db = getAdminDb();
    await db.collection("emailDrafts").doc(id).update({
      subject,
      html,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: "Draft updated" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update draft" },
      { status: 500 },
    );
  }
}

// DELETE — delete a draft
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "Draft ID is required" }, { status: 400 });
    }

    const db = getAdminDb();
    await db.collection("emailDrafts").doc(id).delete();
    return NextResponse.json({ message: "Draft deleted" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete draft" },
      { status: 500 },
    );
  }
}
