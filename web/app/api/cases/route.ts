import { NextResponse } from "next/server";

import { listDemoCases } from "@/lib/persistence";

export const dynamic = "force-dynamic";

/**
 * Server-only read of the synthetic demo-case catalogue.
 * Never returns invented rows: a failure is reported with the real error text.
 */
export async function GET() {
  const { cases, persistence, error } = await listDemoCases();
  return NextResponse.json({ cases, persistence, error, synthetic: true });
}
