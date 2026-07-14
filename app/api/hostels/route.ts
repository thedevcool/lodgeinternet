import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function generatePassword(existingCount: number): string {
  const num = existingCount + 1;
  return `LODGES${String(num).padStart(2, "0")}`;
}

// GET – list all hostels
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("hostels").orderBy("createdAt", "asc").get();
    const hostels = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
    }));
    return NextResponse.json({ hostels });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch hostels" },
      { status: 500 },
    );
  }
}

// POST – create a hostel
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const collageId =
      typeof body.collageId === "string" ? body.collageId.trim() : undefined;

    const db = getAdminDb();
    const snap = await db.collection("hostels").get();
    const password = generatePassword(snap.size);

    const ref = await db.collection("hostels").add({
      name,
      password,
      ...(collageId && { collageId }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id, name, password });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create hostel" },
      { status: 500 },
    );
  }
}

// PUT – update a hostel
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!id || !name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const planTypes: string[] | undefined = Array.isArray(body.planTypes)
      ? (body.planTypes as string[]).filter((p) =>
          ["device", "tv", "unlimited"].includes(p),
        )
      : undefined;

    // Which device-plan variants (by device count) this hostel offers.
    // Only 3 and 5 are valid; anything else is dropped.
    const deviceUserCounts: number[] | undefined = Array.isArray(
      body.deviceUserCounts,
    )
      ? (body.deviceUserCounts as unknown[])
          .map((n) => Number(n))
          .filter((n) => n === 3 || n === 5)
      : undefined;

    const password =
      typeof body.password === "string" ? body.password.trim() : undefined;

    const collageId =
      typeof body.collageId === "string" ? body.collageId.trim() : undefined;

    const db = getAdminDb();
    await db.collection("hostels").doc(id).update({
      name,
      ...(planTypes !== undefined && { planTypes }),
      ...(deviceUserCounts !== undefined && { deviceUserCounts }),
      ...(password !== undefined && { password }),
      ...(collageId !== undefined && { collageId }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update hostel" },
      { status: 500 },
    );
  }
}

// DELETE – delete a hostel
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") || "";

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const db = getAdminDb();
    await db.collection("hostels").doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete hostel" },
      { status: 500 },
    );
  }
}
