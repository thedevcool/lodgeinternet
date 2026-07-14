import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { deleteCloudinaryAssets } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BATCH = 200;

function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

async function drainQueue() {
  const db = getAdminDb();
  const now = new Date();

  const snap = await db
    .collection("pendingImageDeletions")
    .where("deleteAfter", "<=", now)
    .limit(MAX_BATCH)
    .get();

  if (snap.empty) {
    return { processed: 0, deleted: 0, failed: 0 };
  }

  const publicIds: string[] = [];
  const docIdByPublicId = new Map<string, string[]>();
  for (const doc of snap.docs) {
    const id: string | undefined = doc.data().publicId;
    if (!id) continue;
    publicIds.push(id);
    const arr = docIdByPublicId.get(id) ?? [];
    arr.push(doc.id);
    docIdByPublicId.set(id, arr);
  }

  const { deleted, failed } = await deleteCloudinaryAssets(publicIds);

  // Always remove the queue entries — if a destroy failed because the asset
  // no longer exists or was already removed, the row would otherwise loop
  // forever. Real outages still get logged by deleteCloudinaryAssets.
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();

  return { processed: snap.size, deleted, failed };
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainQueue();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[cron/cleanup-email-images]", error);
    return NextResponse.json(
      { error: error.message || "Cleanup failed" },
      { status: 500 },
    );
  }
}

// Manual admin trigger (no Bearer required — protected by admin UI in front of it)
export async function POST() {
  try {
    const result = await drainQueue();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[cron/cleanup-email-images]", error);
    return NextResponse.json(
      { error: error.message || "Cleanup failed" },
      { status: 500 },
    );
  }
}
