import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/emailService";
import { getFeedbackNotificationEmail } from "@/lib/email/emailTemplates";

// POST - Submit feedback
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, planName, type, rating, message, hostel } = body;

    if (!name || !email || !planName || !type || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (type !== "review" && type !== "complaint") {
      return NextResponse.json(
        { error: "Invalid feedback type" },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const feedbackRef = await db.collection("dataFeedback").add({
      name: name.trim(),
      email: email.trim(),
      planName: planName.trim(),
      type,
      rating: rating || null,
      message: message.trim(),
      hostel: hostel?.trim() || "N/A",
      createdAt: FieldValue.serverTimestamp(),
    });

    const adminEmail = process.env.ADMIN_EMAIL || "lodge.internet@gmail.com";
    try {
      await sendEmail({
        to: adminEmail,
        subject: `New ${type === "review" ? "Review" : "Complaint"} - ${planName}`,
        html: getFeedbackNotificationEmail({
          name: name.trim(),
          email: email.trim(),
          planName: planName.trim(),
          type,
          rating: rating || undefined,
          message: message.trim(),
          submittedAt: new Date().toISOString(),
        }),
      });
    } catch (emailError) {
      console.error("Failed to send feedback notification email:", emailError);
    }

    return NextResponse.json({ success: true, id: feedbackRef.id });
  } catch (error: any) {
    console.error("Error submitting feedback:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 },
    );
  }
}

// GET - Fetch feedback (optionally filtered by hostel)
export async function GET(request: NextRequest) {
  try {
    const hostel = request.nextUrl.searchParams.get("hostel") || "";
    const db = getAdminDb();

    let query = db.collection("dataFeedback").orderBy("createdAt", "desc") as FirebaseFirestore.Query;
    if (hostel) {
      query = db.collection("dataFeedback")
        .where("hostel", "==", hostel)
        .orderBy("createdAt", "desc");
    }

    const snapshot = await query.get();
    const feedback = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
    }));

    return NextResponse.json({ feedback });
  } catch (error: any) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 },
    );
  }
}
