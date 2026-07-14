import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendBulkEmail } from "@/lib/email/emailService";
import { getLodgeInternetEmailTemplate } from "@/lib/email/emailTemplates";
import { extractCloudinaryPublicIds } from "@/lib/cloudinary";

const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

type RecipientGroup = "all" | "tv-users" | "data-users" | "specific";

export async function POST(request: NextRequest) {
  let body: {
    subject: string;
    html: string;
    recipientGroup: RecipientGroup;
    specificEmails?: string[];
    hostelFilter?: string;
    senderName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { subject, html, recipientGroup, specificEmails, hostelFilter, senderName: bodySenderName } = body;

  if (!subject?.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  if (!html?.trim()) {
    return NextResponse.json({ error: "Email body is required" }, { status: 400 });
  }
  if (!recipientGroup) {
    return NextResponse.json({ error: "Recipient group is required" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const emailSet = new Map<string, string>(); // email → name

    if (recipientGroup === "specific") {
      if (!specificEmails || specificEmails.length === 0) {
        return NextResponse.json({ error: "No specific recipients provided" }, { status: 400 });
      }
      for (const email of specificEmails) {
        if (email) emailSet.set(email.toLowerCase(), "");
      }
    } else {
      if (recipientGroup === "all" || recipientGroup === "tv-users") {
        const tvSnap = await db.collection("tvSubscriptions").get();
        for (const doc of tvSnap.docs) {
          const data = doc.data();
          const email: string = data.email?.toLowerCase?.() ?? "";
          if (!email || !email.includes("@")) continue;
          if (hostelFilter && data.hostel !== hostelFilter) continue;
          emailSet.set(email, data.name ?? "");
        }
      }

      if (recipientGroup === "all" || recipientGroup === "data-users") {
        const dpSnap = await db.collection("dataPurchases").get();
        for (const doc of dpSnap.docs) {
          const data = doc.data();
          const email: string = (data.customerEmail ?? data.email)?.toLowerCase?.() ?? "";
          if (!email || !email.includes("@") || email === "n/a") continue;
          if (hostelFilter && data.hostel !== hostelFilter) continue;
          emailSet.set(email, emailSet.get(email) ?? "");
        }
      }
    }

    if (emailSet.size === 0) {
      return NextResponse.json(
        { error: "No recipients found for the selected group" },
        { status: 400 },
      );
    }

    const recipients = Array.from(emailSet.entries()).map(([email, name]) => ({ email, name }));
    const wrappedHtml = getLodgeInternetEmailTemplate(html);
    const resolvedSenderName = bodySenderName || process.env.SUPERADMIN_FROM || "Lodge Internet";

    const result = await sendBulkEmail({
      recipients,
      subject,
      getHtml: () => wrappedHtml,
      senderName: resolvedSenderName,
    });

    // Queue any Cloudinary images referenced in the body for deletion 24h
    // after a successful send. The /api/cron/cleanup-email-images cron drains
    // this queue. Best-effort: queue failures never affect the send response.
    let scheduledForDeletion = 0;
    if (result.successCount > 0) {
      const publicIds = extractCloudinaryPublicIds(html);
      if (publicIds.length > 0) {
        try {
          const deleteAfter = new Date(Date.now() + CLEANUP_DELAY_MS);
          const batch = db.batch();
          for (const publicId of publicIds) {
            const ref = db.collection("pendingImageDeletions").doc();
            batch.set(ref, {
              publicId,
              deleteAfter,
              source: "admin-email",
              createdAt: FieldValue.serverTimestamp(),
            });
          }
          await batch.commit();
          scheduledForDeletion = publicIds.length;
        } catch (err) {
          console.warn("[send-email] failed to enqueue image cleanup:", err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent: result.successCount,
      failed: result.failureCount,
      total: recipients.length,
      errors: result.errors,
      scheduledForDeletion,
    });
  } catch (error: any) {
    console.error("[send-email]", error);
    return NextResponse.json(
      { error: error.message || "Failed to send emails" },
      { status: 500 },
    );
  }
}
