import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string };
    if (typeof body.message === "string" && body.message.trim().length > 0) {
      console.log("[webchat] bot message:", body.message);
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
