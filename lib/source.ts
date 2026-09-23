import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SuppliedRecords } from "./types";

/**
 * Reads the supplied exercise records. Read-only: nothing in this app writes to
 * source/initial.json. The file is the single source of truth for the case data.
 */
/**
 * Locates the supplied records.
 *
 * Order matters for deployment: `web/` is deployed on its own (Vercel Root Directory
 * = web), so its own `source/initial.json` is tried first. The parent-directory layout
 * is kept only as a local-development fallback for the monorepo checkout.
 */
export function suppliedRecordsPath(): string {
  if (process.env.OCTOPUS_INITIAL_JSON) return process.env.OCTOPUS_INITIAL_JSON;
  const candidates = [
    path.join(process.cwd(), "source", "initial.json"),
    path.join(process.cwd(), "..", "source", "initial.json"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

export function loadSuppliedRecords(): SuppliedRecords & { fingerprint: string } {
  const file = suppliedRecordsPath();
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  const fingerprint = crypto.createHash("sha256").update(raw).digest("hex");
  return {
    case_id: parsed.case_id,
    data_status: parsed.data_status,
    clock: parsed.clock,
    orders: parsed.orders,
    delivery_notes: parsed.delivery_notes,
    receipts: parsed.receipts,
    invoices: parsed.invoices,
    rules: parsed.rules,
    fingerprint,
  };
}
