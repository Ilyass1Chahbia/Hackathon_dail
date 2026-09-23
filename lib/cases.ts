/**
 * Synthetic demo-case catalogue — the single source of truth for identifier lookup.
 *
 * Pure functions only: no React, no Supabase, no DOM. The entry screen, the QR/barcode
 * scanner, the OCR confirmation and the plain manual input all resolve references
 * through `resolveCase` here, so there is exactly one lookup behaviour in the app.
 *
 * The catalogue rows live in Supabase (`public.c04_demo_cases`). `LOCAL_FALLBACK_CASE`
 * is the supplied DN-1 case, offered explicitly as a local demo fallback when the
 * catalogue cannot be read — it is never presented as a database result.
 */

export interface CaseFixture {
  ordered: number;
  initial_received: number;
  damaged: number;
  accepted: number;
  invoiced: number;
  later_received_adds: number;
  initial_receipt: string;
  invoice: string;
  later_receipt?: string;
  later_delivery_note?: string;
  later_simulation: boolean;
  expected_result: string;
}

export interface DemoCase {
  case_id: string;
  delivery_note: string;
  purchase_order: string;
  part_number: string;
  display_name: string;
  fixture: CaseFixture;
  synthetic: boolean;
}

/** The supplied primary case. Always resolvable, even with no database. */
export const LOCAL_FALLBACK_CASE: DemoCase = {
  case_id: "C04-FILTER-X",
  delivery_note: "DN-1",
  purchase_order: "PO-1",
  part_number: "FILTER-X",
  display_name: "Filter X · staged delivery",
  fixture: {
    ordered: 10,
    initial_received: 8,
    damaged: 1,
    accepted: 7,
    invoiced: 10,
    later_received_adds: 2,
    initial_receipt: "RC-1",
    invoice: "INV-1",
    later_receipt: "RC-2",
    later_delivery_note: "DN-2",
    later_simulation: true,
    expected_result: "possible shortage, then damage only after RC-2",
  },
  synthetic: true,
};

/** Uppercase and strip the separators a human or an OCR pass might add. */
export function normalizeReference(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export type NormalizeOptions = {
  /** Extra tokens (e.g. a part number on the label) that count as a match. */
  known?: string[];
};

/**
 * Pull candidate references out of arbitrary OCR text.
 * Regex first (`DN-…` / `PO-…`), then known identifiers seen as whole tokens.
 * Ordered and de-duplicated; never invents a value.
 */
export function extractCandidates(text: string, known: string[] = []): string[] {
  const upper = (text ?? "").toUpperCase();
  const found: string[] = [];
  const push = (value: string) => {
    const clean = normalizeReference(value);
    if (clean && !found.includes(clean)) found.push(clean);
  };

  // A label may print "DN 30" as readily as "DN-30", so allow a separator gap and
  // normalise the prefix back to the canonical hyphenated form.
  for (const match of upper.match(/\b(?:DN|PO)[\s-]*[0-9][A-Z0-9-]*/g) ?? []) {
    push(match.replace(/^(DN|PO)[\s-]*/, "$1-"));
  }
  for (const identifier of known) {
    const token = normalizeReference(identifier);
    if (!token) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^A-Z0-9-])${escaped}([^A-Z0-9-]|$)`).test(upper)) push(token);
  }
  return found;
}

/** Fields an identifier may legitimately match. Invoice ids are deliberately excluded. */
function aliases(demoCase: DemoCase): string[] {
  const bare = demoCase.case_id.replace(/^C04-/, "");
  return [demoCase.delivery_note, demoCase.purchase_order, demoCase.part_number, bare, demoCase.case_id]
    .filter(Boolean)
    .map(normalizeReference);
}

/** The one and only lookup. Returns null when nothing matches — callers must not navigate. */
export function resolveCase(raw: string, cases: DemoCase[]): DemoCase | null {
  const wanted = normalizeReference(raw);
  if (!wanted) return null;
  return cases.find((demoCase) => aliases(demoCase).includes(wanted)) ?? null;
}

/** Every identifier a scan or OCR pass may legitimately produce, for candidate matching. */
export function knownIdentifiers(cases: DemoCase[]): string[] {
  return cases.flatMap((demoCase) => [
    demoCase.delivery_note,
    demoCase.purchase_order,
    demoCase.part_number,
  ]);
}
