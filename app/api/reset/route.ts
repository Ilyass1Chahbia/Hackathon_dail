import { NextResponse } from "next/server";
import { resetPersisted } from "@/lib/persistence";

export const dynamic = "force-dynamic";

/** Clears persisted simulated events/decisions only. source/initial.json is untouched. */
export async function POST() {
  const persistence = await resetPersisted();
  return NextResponse.json({ reset: true, persistence });
}
