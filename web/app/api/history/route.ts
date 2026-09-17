import { NextResponse } from "next/server";
import { listHistory } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listHistory());
}
