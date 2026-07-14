import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/emailService";
import {
  getSplitPartnerEmail,
  type SplitEmailData,
  type SplitEmailRow,
} from "@/lib/email/emailTemplates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      to,
      split,
      transactions,
      periodLabel,
    }: {
      to: string;
      split: SplitEmailData;
      transactions: SplitEmailRow[];
      periodLabel: string;
    } = body;

    if (!to || !split) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!EMAIL_RE.test(to)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    const html = getSplitPartnerEmail(
      split,
      transactions ?? [],
      periodLabel ?? "",
    );

    const subject = `Revenue Split Report — ${split.hostel}${periodLabel ? ` (${periodLabel})` : ""}`;

    await sendEmail({
      to,
      subject,
      html,
      senderName: "Lodge Internet",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[send-split-email]", err);
    return NextResponse.json(
      { error: err.message || "Failed to send email" },
      { status: 500 },
    );
  }
}
