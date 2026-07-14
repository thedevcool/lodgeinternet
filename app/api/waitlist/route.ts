import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/emailService";
import { getWaitlistConfirmationEmail } from "@/lib/email/emailTemplates";

/**
 * Normalise a Nigerian WhatsApp number into E.164 (+234…) form.
 * Accepts:
 *   - 0801 234 5678        → +2348012345678
 *   - 0 801 2345678        → +2348012345678
 *   - 234 801 234 5678     → +2348012345678
 *   - +234 801 234 5678    → +2348012345678
 *   - 801 234 5678 (10-d)  → +2348012345678  (assumes NG mobile prefix)
 * Returns null if the number can't be made into a valid NG mobile number.
 */
function normalizeNigerianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let national = "";
  if (digits.startsWith("234") && digits.length === 13) {
    national = digits.slice(3); // strip 234 → 10 digits
  } else if (digits.startsWith("0") && digits.length === 11) {
    national = digits.slice(1); // strip leading 0 → 10 digits
  } else if (digits.length === 10) {
    national = digits;
  } else {
    return null;
  }
  // NG mobile numbers start with 7, 8, or 9
  if (!/^[789]/.test(national)) return null;
  return `+234${national}`;
}

function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const audienceType =
      body?.audienceType === "student" || body?.audienceType === "resident"
        ? body.audienceType
        : "";
    const whatsappRaw = typeof body?.whatsappPhone === "string" ? body.whatsappPhone.trim() : "";
    const affordability =
      body?.affordability === "yes" || body?.affordability === "manage"
        ? body.affordability
        : "";

    // Student fields
    const schoolName = typeof body?.schoolName === "string" ? body.schoolName.trim() : "";
    const hostelName = typeof body?.hostelName === "string" ? body.hostelName.trim() : "";
    const schoolAddress = typeof body?.schoolAddress === "string" ? body.schoolAddress.trim() : "";
    // hostelOccupants: rough population of the hostel. Used by admin to size demand.
    const hostelOccupantsRaw = body?.hostelOccupants;
    const hostelOccupants =
      typeof hostelOccupantsRaw === "number"
        ? Math.floor(hostelOccupantsRaw)
        : typeof hostelOccupantsRaw === "string" && hostelOccupantsRaw.trim()
          ? Math.floor(Number(hostelOccupantsRaw))
          : NaN;
    // Resident fields
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    const estate = typeof body?.estate === "string" ? body.estate.trim() : "";
    const city = typeof body?.city === "string" ? body.city.trim() : "";

    if (!email || !isEmail(email)) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }
    if (!audienceType) {
      return NextResponse.json({ error: "Please tell us if you're a student or a resident" }, { status: 400 });
    }
    if (audienceType === "student") {
      if (!schoolName || !hostelName || !schoolAddress) {
        return NextResponse.json(
          { error: "School name, hostel name and school address are all required" },
          { status: 400 },
        );
      }
      if (!Number.isFinite(hostelOccupants) || hostelOccupants < 1 || hostelOccupants > 5000) {
        return NextResponse.json(
          { error: "Please give a rough number of people in your hostel (1–5000)" },
          { status: 400 },
        );
      }
    } else {
      if (!address || !estate || !city) {
        return NextResponse.json(
          { error: "Address, estate name and city are all required" },
          { status: 400 },
        );
      }
    }
    if (!affordability) {
      return NextResponse.json({ error: "Please pick an affordability option" }, { status: 400 });
    }
    const whatsappPhone = normalizeNigerianPhone(whatsappRaw);
    if (!whatsappPhone) {
      return NextResponse.json(
        { error: "Please enter a valid Nigerian WhatsApp number (e.g. 0801 234 5678)" },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    // Block duplicates on email OR whatsapp — either match counts as "already on list".
    const [byEmail, byPhone] = await Promise.all([
      db.collection("waitlist").where("email", "==", email).limit(1).get(),
      db.collection("waitlist").where("whatsappPhone", "==", whatsappPhone).limit(1).get(),
    ]);
    if (!byEmail.empty || !byPhone.empty) {
      return NextResponse.json(
        {
          error:
            "You're already on the waitlist — we'll reach out as soon as Lodge Internet is available in your area.",
          duplicate: true,
        },
        { status: 409 },
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;

    const doc: Record<string, any> = {
      email,
      whatsappPhone,
      audienceType,
      affordability,
      status: "new",
      ip,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (audienceType === "student") {
      doc.schoolName = schoolName;
      doc.hostelName = hostelName;
      doc.schoolAddress = schoolAddress;
      doc.hostelOccupants = hostelOccupants;
    } else {
      doc.address = address;
      doc.estate = estate;
      doc.city = city;
    }

    await db.collection("waitlist").add(doc);

    // Fire-and-forget the confirmation email so the API responds instantly.
    // A failed send is non-fatal — the row is already saved, admin can resend
    // from the dashboard if needed.
    void (async () => {
      try {
        await sendEmail({
          to: email,
          subject: "You're on the Lodge Internet waitlist 🎉",
          html: getWaitlistConfirmationEmail({ audienceType }),
          senderName: "Lodge Internet",
        });
      } catch (mailErr) {
        console.error("Waitlist confirmation email failed:", mailErr);
      }
    })();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error submitting waitlist entry:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to submit waitlist entry" },
      { status: 500 },
    );
  }
}
