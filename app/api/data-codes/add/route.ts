import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import {
  encryptCode,
  hashCode,
  maskCode,
  normalizeCode,
} from "@/lib/dataCodeCrypto";

// GET — list codes for a given planId + hostel
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId") || "";
  const hostel = searchParams.get("hostel") || "";

  if (!planId || !hostel) {
    return NextResponse.json(
      { error: "planId and hostel are required" },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection("dataCodes")
      .where("planId", "==", planId)
      .where("hostel", "==", hostel)
      .get();

    const codes = snap.docs
      .map((doc) => ({
        id: doc.id,
        planId,
        hostel: doc.data().hostel ?? "",
        codeMask: doc.data().codeMask ?? "",
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
      }))
      .sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

    return NextResponse.json({ codes });
  } catch (error: any) {
    console.error("Error fetching data codes:", error);
    return NextResponse.json(
      { error: "Failed to fetch codes" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const db = getAdminDb();
    const body = await request.json();
    const planName =
      typeof body.planName === "string" ? body.planName.trim() : "";
    const planType =
      body.planType === "tv"
        ? "tv"
        : body.planType === "unlimited"
          ? "unlimited"
          : "device";
    let unlimitedPeriod =
      typeof body.unlimitedPeriod === "string"
        ? body.unlimitedPeriod.trim()
        : "";
    const usersCount = Number(body.usersCount) || undefined;
    const duration = Number(body.duration) || undefined;
    const price = Number(body.price);
    const rawCode = typeof body.code === "string" ? body.code : "";
    const hostel = typeof body.hostel === "string" ? body.hostel.trim() : "";

    if (!planName || !price) {
      return NextResponse.json(
        { error: "Plan name and price are required" },
        { status: 400 },
      );
    }
    if (planType === "device" && !usersCount) {
      return NextResponse.json(
        { error: "Users count is required for device plans" },
        { status: 400 },
      );
    }
    if (planType === "device" && !rawCode.trim()) {
      return NextResponse.json(
        { error: "Access code is required for device plans" },
        { status: 400 },
      );
    }
    if (planType === "unlimited" && !rawCode.trim()) {
      return NextResponse.json(
        { error: "Access code is required for unlimited plans" },
        { status: 400 },
      );
    }
    if (planType === "unlimited" && !unlimitedPeriod) {
      // Try to resolve from an existing plan in the DB
      const fallbackSnap = await db
        .collection("dataPlans")
        .where("name", "==", planName)
        .where("planType", "==", "unlimited")
        .where("price", "==", price)
        .where("hostelId", "==", hostel)
        .limit(1)
        .get();
      if (!fallbackSnap.empty) {
        const existing = fallbackSnap.docs[0].data();
        if (existing.unlimitedPeriod) {
          unlimitedPeriod = existing.unlimitedPeriod;
        }
      }
      if (!unlimitedPeriod) {
        console.log(unlimitedPeriod, planName);
        return NextResponse.json(
          { error: "Period is required for unlimited plans" },
          { status: 400 },
        );
      }
    }
    if (!hostel) {
      return NextResponse.json(
        { error: "Hostel is required" },
        { status: 400 },
      );
    }
    if (planType === "tv" && !duration) {
      return NextResponse.json(
        { error: "Duration is required for TV plans" },
        { status: 400 },
      );
    }

    // Find or create the plan scoped to this hostel
    let planQuery: FirebaseFirestore.Query;
    if (planType === "device") {
      planQuery = db
        .collection("dataPlans")
        .where("name", "==", planName)
        .where("planType", "==", "device")
        .where("usersCount", "==", usersCount)
        .where("price", "==", price)
        .where("hostelId", "==", hostel)
        .limit(1);
    } else if (planType === "unlimited") {
      planQuery = db
        .collection("dataPlans")
        .where("name", "==", planName)
        .where("planType", "==", "unlimited")
        .where("unlimitedPeriod", "==", unlimitedPeriod)
        .where("price", "==", price)
        .where("hostelId", "==", hostel)
        .limit(1);
    } else {
      planQuery = db
        .collection("dataPlans")
        .where("name", "==", planName)
        .where("planType", "==", "tv")
        .where("duration", "==", duration)
        .where("price", "==", price)
        .where("hostelId", "==", hostel)
        .limit(1);
    }

    const planSnapshot = await planQuery.get();

    let planId: string;
    if (planSnapshot.empty) {
      const planData: any = {
        name: planName,
        planType,
        price,
        hostelId: hostel,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (planType === "device") planData.usersCount = usersCount;
      else if (planType === "unlimited") {
        planData.unlimitedPeriod = unlimitedPeriod;
        if (usersCount) planData.usersCount = usersCount;
      } else {
        planData.duration = duration;
      }
      const created = await db.collection("dataPlans").add(planData);
      planId = created.id;
    } else {
      const existing = planSnapshot.docs[0];
      planId = existing.id;
      await existing.ref.update({ updatedAt: FieldValue.serverTimestamp() });
    }

    // TV plans need no codes
    if (planType === "tv") {
      return NextResponse.json({
        planId,
        message: "TV plan created successfully",
      });
    }

    // For device/unlimited plans, create the code
    const normalizedCode = normalizeCode(rawCode);
    const codeHash = hashCode(normalizedCode);

    const duplicateSnap = await db
      .collection("dataCodes")
      .where("planId", "==", planId)
      .where("hostel", "==", hostel)
      .where("codeHash", "==", codeHash)
      .limit(1)
      .get();

    if (!duplicateSnap.empty) {
      return NextResponse.json(
        { error: "This code already exists for the selected plan" },
        { status: 409 },
      );
    }

    const encryptedCode = encryptCode(normalizedCode);
    const codeMask = maskCode(normalizedCode);

    const createdCode = await db.collection("dataCodes").add({
      planId,
      hostel,
      codeHash,
      codeMask,
      encryptedCode,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ planId, codeId: createdCode.id, codeMask });
  } catch (error: any) {
    console.error("Error adding data code:", error);
    return NextResponse.json(
      { error: "Failed to add data code" },
      { status: 500 },
    );
  }
}
