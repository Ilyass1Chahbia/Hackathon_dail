import { NextResponse } from "next/server";

import { API_BASE_MISSING, apiBase } from "@/lib/api-base";

export const dynamic = "force-dynamic";

/** Forwards an evidence set to the deterministic Python/LangGraph workflow. */
export async function POST(request: Request) {
  const API_BASE = apiBase();
  if (!API_BASE) {
    return NextResponse.json({ error: "Deterministic workflow not configured", detail: API_BASE_MISSING }, { status: 503 });
  }
  const body = await request.text();
  try {
    const response = await fetch(`${API_BASE}/reconcile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: `Deterministic workflow returned ${response.status}`, detail: payload },
        { status: 502 },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Deterministic workflow unreachable",
        detail:
          `Could not reach the FastAPI/LangGraph service at ${API_BASE}. ` +
          "Start it with ./scripts/dev.sh (or: cd api && uv run uvicorn app.main:app --port 8000). " +
          `Cause: ${String(error)}`,
      },
      { status: 503 },
    );
  }
}
