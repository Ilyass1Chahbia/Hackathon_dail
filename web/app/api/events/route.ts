import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/persistence";

export const dynamic = "force-dynamic";

/** Records one simulated interaction event. Never writes supplied records. */
export async function POST(request: Request) {
  const body = (await request.json()) as { kind?: string; payload?: Record<string, unknown> };
  if (!body.kind) {
    return NextResponse.json({ error: "kind is required" }, { status: 400 });
  }
  const ack = await recordEvent(body.kind, body.payload ?? {}, true);
  return NextResponse.json(ack);
}
