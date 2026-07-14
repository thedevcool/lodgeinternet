import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { toHostelSlug } from "@/lib/hostelSlug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET – list all collages
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("hostelCollages")
      .orderBy("createdAt", "asc")
      .get();
    const collages = snap.docs.map((d) => ({
      id: d.id,
      name: d.data().name ?? "",
      slug: d.data().slug ?? "",
      isActive: d.data().isActive ?? true,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
    }));
    return NextResponse.json({ collages });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch collages" },
      { status: 500 },
    );
  }
}

// POST – create a collage
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const slug = toHostelSlug(name);

    const db = getAdminDb();

    // Ensure slug is unique
    const existing = await db
      .collection("hostelCollages")
      .where("slug", "==", slug)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { error: "A collage with this name already exists" },
        { status: 409 },
      );
    }

    const ref = await db.collection("hostelCollages").add({
      name,
      slug,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id, name, slug });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create collage" },
      { status: 500 },
    );
  }
}
