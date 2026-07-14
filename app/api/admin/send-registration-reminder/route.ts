import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/emailService";
import { getRegistrationReminderEmail } from "@/lib/email/emailTemplates";
import { generateCode, storeCode } from "@/lib/verificationCode";
import { getVerificationCodeEmail } from "@/lib/email/emailTemplates";
import { toHostelSlug } from "@/lib/hostelSlug";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://lodgeinternet.com";

/**
 * Infer the most likely hostel for a user by looking at their purchase history.
 * Returns the hostel from their most recent dataPurchase, or undefined.
 */
async function inferHostelFromPurchases(
  email: string,
  db: FirebaseFirestore.Firestore,
): Promise<string | undefined> {
  const snap = await db
    .collection("dataPurchases")
    .where("customerEmail", "==", email)
    .orderBy("purchasedAt", "desc")
    .limit(1)
    .get();

  if (snap.empty) return undefined;
  const hostel = snap.docs[0].data().hostel;
  return hostel && hostel !== "N/A" ? hostel : undefined;
}

// POST — send a registration-reminder email to one user, or bulk to all
// Body: { userIds?: string[] }  (omit or pass [] to send to ALL needs-setup users)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userIds: string[] =
      Array.isArray(body.userIds) ? body.userIds : [];

    const db = getAdminDb();

    // Fetch target users — either the specified IDs or all "needs setup" users
    let users: { id: string; email: string; hostelId: string; emailVerified: boolean }[] = [];

    if (userIds.length > 0) {
      const docs = await Promise.all(
        userIds.map((id) => db.collection("users").doc(id).get()),
      );
      users = docs
        .filter((d) => d.exists)
        .map((d) => ({
          id: d.id,
          email: d.data()!.email || "",
          hostelId: d.data()!.hostelId || "",
          emailVerified: d.data()!.emailVerified ?? false,
        }))
        .filter((u) => u.email);
    } else {
      // Bulk: all users with no hostel or "Unknown"
      const snap = await db.collection("users").get();
      users = snap.docs
        .map((d) => ({
          id: d.id,
          email: d.data().email || "",
          hostelId: d.data().hostelId || "",
          emailVerified: d.data().emailVerified ?? false,
        }))
        .filter(
          (u) =>
            u.email &&
            (!u.hostelId || u.hostelId === "Unknown"),
        );
    }

    if (users.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0 });
    }

    let sent = 0;
    let skipped = 0;

    await Promise.all(
      users.map(async (user) => {
        try {
          const suggestedHostel = await inferHostelFromPurchases(
            user.email,
            db,
          );

          if (user.emailVerified) {
            // Verified account, unknown hostel — send them to the hostel-update flow
            const registerUrl = `${BASE_URL}/register?email=${encodeURIComponent(
              user.email,
            )}${suggestedHostel ? `&hostel=${encodeURIComponent(suggestedHostel)}` : ""}&update=1`;

            await sendEmail({
              to: user.email,
              subject: "Action Required: Complete Your Lodge Internet Registration",
              html: getRegistrationReminderEmail({
                customerEmail: user.email,
                suggestedHostel,
                registerUrl,
              }),
              senderName: "Lodge Internet",
            });
          } else {
            // Unverified account — update hostel if we can infer one, then send a
            // fresh verification code so they can finish onboarding directly.
            if (suggestedHostel) {
              await db.collection("users").doc(user.id).update({
                hostelId: suggestedHostel,
                hostelSlug: toHostelSlug(suggestedHostel),
                updatedAt: FieldValue.serverTimestamp(),
              });
            }

            const code = generateCode();
            await storeCode(user.id, code);

            await sendEmail({
              to: user.email,
              subject: "Lodge Internet — Verify Your Email",
              html: getVerificationCodeEmail({ code, email: user.email }),
              senderName: "Lodge Internet",
            });
          }

          sent++;
        } catch (err) {
          console.error(
            `[send-registration-reminder] Failed for ${user.email}:`,
            err,
          );
          skipped++;
        }
      }),
    );

    return NextResponse.json({ sent, skipped });
  } catch (error: any) {
    console.error("[send-registration-reminder]", error);
    return NextResponse.json(
      { error: error.message || "Failed to send reminders" },
      { status: 500 },
    );
  }
}
