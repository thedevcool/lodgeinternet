import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLLECTION = "settings";
const DOC_ID = "siteConfig";
const REDIS_LOCKDOWN_KEY = "site:lockdown";

// GET — fetch site settings
export async function GET() {
  try {
    const db = getAdminDb();
    const doc = await db.collection(COLLECTION).doc(DOC_ID).get();

    if (!doc.exists) {
      return NextResponse.json({
        lockdownEnabled: false,
        lockdownMessage:
          "We're currently performing scheduled maintenance. We'll be back shortly.",
        updatedAt: null,
        updatedBy: null,
      });
    }

    const data = doc.data()!;
    return NextResponse.json({
      lockdownEnabled: data.lockdownEnabled ?? false,
      lockdownMessage:
        data.lockdownMessage ??
        "We're currently performing scheduled maintenance. We'll be back shortly.",
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      updatedBy: data.updatedBy ?? null,
    });
  } catch (error: any) {
    console.error("[settings GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — update site settings (using POST to avoid infrastructure-level PUT filtering)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const lockdownEnabled =
      typeof body.lockdownEnabled === "boolean" ? body.lockdownEnabled : null;
    const lockdownMessage =
      typeof body.lockdownMessage === "string"
        ? body.lockdownMessage.trim()
        : null;
    const updatedBy =
      typeof body.updatedBy === "string" ? body.updatedBy.trim() : "admin";

    if (lockdownEnabled === null) {
      return NextResponse.json(
        { error: "lockdownEnabled (boolean) is required" },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    const updateData: Record<string, any> = {
      lockdownEnabled,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    };

    if (lockdownMessage !== null) {
      updateData.lockdownMessage = lockdownMessage;
    }

    await db
      .collection(COLLECTION)
      .doc(DOC_ID)
      .set(updateData, { merge: true });

    // Sync lockdown state to Redis for fast middleware reads
    let redisAvailable = true;
    try {
      const r = getRedis();
      if (lockdownEnabled) {
        await r.set(REDIS_LOCKDOWN_KEY, "1");
      } else {
        await r.del(REDIS_LOCKDOWN_KEY);
      }
    } catch (redisError) {
      console.error("[settings POST] Redis sync failed:", redisError);
      redisAvailable = false;
    }

    return NextResponse.json({ success: true, lockdownEnabled, redisAvailable });
  } catch (error: any) {
    console.error("[settings POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
