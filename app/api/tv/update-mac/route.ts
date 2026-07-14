import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { encryptMacAddress, normalizeMacAddress } from "@/lib/macAddressCrypto";
import { sendEmail } from "@/lib/email/emailService";
import {
  getTVMacAddressUpdatedEmail,
  getTVMacAddressUpdatedAdminNotification,
} from "@/lib/email/emailTemplates";
import { verifyAuth, authErrorStatus } from "@/lib/verifyAuth";

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const subscriptionId =
      typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
    const macAddress =
      typeof body.macAddress === "string" ? body.macAddress.trim() : "";

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 },
      );
    }

    if (!macAddress) {
      return NextResponse.json(
        { error: "MAC address is required" },
        { status: 400 },
      );
    }

    if (!MAC_REGEX.test(macAddress)) {
      return NextResponse.json(
        {
          error:
            "Please enter a valid MAC address (e.g., 00:1A:2B:3C:4D:5E)",
        },
        { status: 400 },
      );
    }

    const auth = await verifyAuth(request, body, {
      requireFreshSession: true,
    });

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error.message, code: auth.error.code },
        { status: authErrorStatus(auth.error) },
      );
    }

    const db = getAdminDb();
    const subRef = db.collection("tvSubscriptions").doc(subscriptionId);
    const subSnap = await subRef.get();

    if (!subSnap.exists) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    const sub = subSnap.data()!;
    const callerOwnsByUid = sub.userId && sub.userId === auth.user.uid;
    const callerOwnsByEmail =
      typeof sub.email === "string" &&
      sub.email.toLowerCase() === auth.user.email.toLowerCase();

    if (!callerOwnsByUid && !callerOwnsByEmail) {
      return NextResponse.json(
        { error: "You don't have permission to update this subscription." },
        { status: 403 },
      );
    }

    const update: Record<string, any> = {
      macAddressHash: encryptMacAddress(macAddress),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // If userId was missing (e.g. webhook-created row), link it now
    if (!sub.userId && callerOwnsByEmail) {
      update.userId = auth.user.uid;
    }

    if (sub.migrationNote) {
      update.migrationNote = FieldValue.delete();
    }

    await subRef.update(update);

    const normalized = normalizeMacAddress(macAddress);
    const formatted = normalized.match(/.{1,2}/g)?.join(":") || normalized;
    const customerName = sub.name || auth.user.displayName || auth.user.email.split("@")[0];

    try {
      await sendEmail({
        to: auth.user.email,
        subject: `TV MAC Address Updated - ${sub.planName || "TV Subscription"}`,
        html: getTVMacAddressUpdatedEmail({
          customerName,
          planName: sub.planName || "TV Subscription",
          macAddress: formatted,
        }),
        senderName: "Lodge Internet",
      });
    } catch (emailError) {
      console.error("Error sending MAC update email:", emailError);
    }

    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `TV MAC Updated - ${customerName} (${sub.hostel || "N/A"})`,
          html: getTVMacAddressUpdatedAdminNotification({
            customerName,
            customerEmail: auth.user.email,
            hostel: sub.hostel || "N/A",
            planName: sub.planName || "TV Subscription",
            macAddress: formatted,
            subscriptionId,
          }),
          senderName: "Lodge Internet",
        });
      }
    } catch (adminEmailError) {
      console.error("Error sending MAC update admin notification:", adminEmailError);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating MAC address:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update MAC address" },
      { status: 500 },
    );
  }
}
