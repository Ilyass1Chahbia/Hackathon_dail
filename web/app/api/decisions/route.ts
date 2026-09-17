import { NextResponse } from "next/server";
import { recordDecision } from "@/lib/persistence";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["approved", "corrected", "unresolved"]);

/** Persists a human reviewer decision. No inventory, accounting or supplier action. */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    decision?: string;
    explanation?: string;
    correction?: string | null;
    engine_version?: string;
    snapshot?: Record<string, unknown>;
  };
  if (!body.decision || !ALLOWED.has(body.decision)) {
    return NextResponse.json({ error: "decision must be approved, corrected or unresolved" }, { status: 400 });
  }
  if (body.decision === "corrected" && !(body.correction ?? "").trim()) {
    return NextResponse.json({ error: "a correction note is required when correcting the explanation" }, { status: 400 });
  }
  const ack = await recordDecision({
    decision: body.decision,
    explanation: body.explanation ?? "",
    correction: body.correction ?? null,
    engine_version: body.engine_version ?? "unknown",
    snapshot: body.snapshot ?? {},
  });
  return NextResponse.json(ack);
}
