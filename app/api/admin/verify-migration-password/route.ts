import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const expected = process.env.MIGRATION_PASSWORD;

    if (!expected) {
      return NextResponse.json(
        { error: "Migration password is not configured on the server." },
        { status: 500 },
      );
    }

    if (!password || password !== expected) {
      return NextResponse.json(
        { error: "Incorrect password." },
        { status: 401 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
