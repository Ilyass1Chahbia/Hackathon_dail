import { NextResponse } from "next/server";

import { API_BASE_MISSING, apiBase } from "@/lib/api-base";

export const dynamic = "force-dynamic";

/**
 * Reveals a supplied record read-only from source/initial.json (via the Python
 * service). Used by the clearly-labelled RC-2 simulation; nothing is modified.
 */
export async function GET(_request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await context.params;
  const API_BASE = apiBase();
  if (!API_BASE) {
    return NextResponse.json({ error: "Deterministic workflow not configured", detail: API_BASE_MISSING }, { status: 503 });
  }
  try {
    const response = await fetch(`${API_BASE}/records/${kind}/${id}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: `Unknown supplied record ${kind}/${id}` }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: "Deterministic workflow unreachable", detail: String(error) },
      { status: 503 },
    );
  }
}
