import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/emailService";
import {
  getTVSubscriptionExpiringSoonEmail,
  getTVSubscriptionExpiredEmail,
} from "@/lib/email/emailTemplates";

/**
 * GET is the cron path — when CRON_SECRET is configured, the bearer is required
 * so external schedulers (Vercel Cron, etc.) must present it.
 * POST is the admin manual-trigger path — gated only by the admin UI in front
 * of it, matching the rest of the /api/admin/* surface in this app.
 */
function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

async function checkSubscriptionExpiry() {
  const db = getAdminDb();
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const results = {
    expiringSoonNotifications: 0,
    expiredNotifications: 0,
    errors: [] as string[],
  };

  const activeSnap = await db
    .collection("tvSubscriptions")
    .where("subscriptionStatus", "==", "active")
    .get();

  for (const subscriptionDoc of activeSnap.docs) {
    const sub = subscriptionDoc.data();
    const expiresAt = sub.expiresAt?.toDate() as Date | undefined;
    if (!expiresAt) continue;

    const customerName = sub.name || sub.email.split("@")[0];

    if (expiresAt <= now) {
      try {
        await subscriptionDoc.ref.update({
          subscriptionStatus: "expired",
          updatedAt: FieldValue.serverTimestamp(),
        });

        await sendEmail({
          to: sub.email,
          subject: `Your TV Subscription Has Expired – ${sub.planName}`,
          html: getTVSubscriptionExpiredEmail({
            customerName,
            planName: sub.planName,
            expiredAt: expiresAt.toISOString(),
          }),
          senderName: "Lodge Internet",
        });

        results.expiredNotifications++;
      } catch (err: any) {
        const msg = `Expired – failed for ${sub.email}: ${err?.message ?? err}`;
        console.error(msg);
        results.errors.push(msg);
      }
    } else if (expiresAt <= tomorrow && !sub.expiryReminderSent) {
      try {
        await sendEmail({
          to: sub.email,
          subject: `Your TV Subscription Expires Soon – ${sub.planName}`,
          html: getTVSubscriptionExpiringSoonEmail({
            customerName,
            planName: sub.planName,
            expiresAt: expiresAt.toISOString(),
          }),
          senderName: "Lodge Internet",
        });

        await subscriptionDoc.ref.update({
          expiryReminderSent: true,
          updatedAt: FieldValue.serverTimestamp(),
        });

        results.expiringSoonNotifications++;
      } catch (err: any) {
        const msg = `Expiring-soon – failed for ${sub.email}: ${err?.message ?? err}`;
        console.error(msg);
        results.errors.push(msg);
      }
    }
  }

  if (
    (results.expiringSoonNotifications > 0 ||
      results.expiredNotifications > 0) &&
    process.env.ADMIN_EMAIL
  ) {
    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `TV Subscription Summary – ${results.expiringSoonNotifications} expiring, ${results.expiredNotifications} expired`,
        html: buildAdminSummaryHtml(results),
        senderName: "Davo-Nexus Limited System",
      });
    } catch (err) {
      console.error("Admin summary email failed:", err);
    }
  }

  return { success: true, message: "Expiry check completed", results };
}

function buildAdminSummaryHtml(results: {
  expiringSoonNotifications: number;
  expiredNotifications: number;
  errors: string[];
}) {
  return `<!DOCTYPE html>
<html>
<head><style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f7;margin:0;padding:20px}
  .card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden}
  .header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:30px}
  .body{padding:30px}
  .stat{background:#f5f5f7;border-radius:8px;padding:20px;margin:12px 0}
  .num{font-size:32px;font-weight:700;color:#0071e3}
  .warn{color:#f59e0b}.err{color:#ef4444}
  .errors{border-left:4px solid #ef4444;padding:15px;background:#fee2e2;border-radius:0 8px 8px 0}
  a{color:#0071e3}
</style></head>
<body>
<div class="card">
  <div class="header">
    <h2 style="margin:0">📊 TV Subscription Daily Summary</h2>
    <p style="margin:5px 0 0;opacity:.9">${new Date().toLocaleString()}</p>
  </div>
  <div class="body">
    <div class="stat">
      <p style="margin:0;color:#86868b">Expiring-soon reminders sent</p>
      <p class="num warn">${results.expiringSoonNotifications}</p>
    </div>
    <div class="stat">
      <p style="margin:0;color:#86868b">Subscriptions marked expired</p>
      <p class="num err">${results.expiredNotifications}</p>
    </div>
    ${
      results.errors.length > 0
        ? `<div class="errors"><strong>⚠️ ${results.errors.length} error(s)</strong><ul style="margin:8px 0;padding-left:20px">${results.errors.map((e) => `<li>${e}</li>`).join("")}</ul></div>`
        : '<p style="color:#10b981">✅ No errors</p>'
    }
    <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/tv-users">Open TV Users Dashboard →</a></p>
  </div>
</div>
</body>
</html>`;
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await checkSubscriptionExpiry());
  } catch (error: any) {
    console.error("[check-expiry GET]", error);
    return NextResponse.json(
      { error: error.message || "Failed to check subscription expiry" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    return NextResponse.json(await checkSubscriptionExpiry());
  } catch (error: any) {
    console.error("[check-expiry POST]", error);
    return NextResponse.json(
      { error: error.message || "Failed to check subscription expiry" },
      { status: 500 },
    );
  }
}
