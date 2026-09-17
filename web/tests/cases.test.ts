/**
 * Focused tests for the identifier lookup and OCR candidate extraction.
 *
 * Run with:  cd web && npm run test:cases
 * Node 24 strips the TypeScript types directly, so this needs no test framework.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LOCAL_FALLBACK_CASE,
  extractCandidates,
  knownIdentifiers,
  normalizeReference,
  resolveCase,
  type DemoCase,
} from "../lib/cases.ts";

const FIXTURE_CASES: DemoCase[] = [
  LOCAL_FALLBACK_CASE,
  {
    case_id: "C04-AIR-FILTER",
    delivery_note: "DN-20",
    purchase_order: "PO-20",
    part_number: "AIR-FILTER-Y",
    display_name: "Air filter Y · clean match",
    fixture: {
      ordered: 20, initial_received: 20, damaged: 0, accepted: 20, invoiced: 20,
      later_received_adds: 0, initial_receipt: "RC-20", invoice: "INV-20",
      later_simulation: false, expected_result: "matched",
    },
    synthetic: true,
  },
  {
    case_id: "C04-BRAKE-DISC",
    delivery_note: "DN-30",
    purchase_order: "PO-30",
    part_number: "BRAKE-DISC-Z",
    display_name: "Brake disc Z · damage exception",
    fixture: {
      ordered: 12, initial_received: 12, damaged: 2, accepted: 10, invoiced: 12,
      later_received_adds: 0, initial_receipt: "RC-30", invoice: "INV-30",
      later_simulation: false, expected_result: "damage exception requiring review",
    },
    synthetic: true,
  },
];

test("DN-1, PO-1 and FILTER-X resolve to C04-FILTER-X", () => {
  for (const reference of ["DN-1", "PO-1", "FILTER-X", "dn-1", " filter-x ", "C04-FILTER-X"]) {
    assert.equal(resolveCase(reference, FIXTURE_CASES)?.case_id, "C04-FILTER-X", reference);
  }
});

test("DN-20 and PO-20 resolve to the air-filter case", () => {
  for (const reference of ["DN-20", "PO-20", "AIR-FILTER-Y"]) {
    assert.equal(resolveCase(reference, FIXTURE_CASES)?.case_id, "C04-AIR-FILTER", reference);
  }
});

test("DN-30 and PO-30 resolve to the brake-disc case", () => {
  for (const reference of ["DN-30", "PO-30", "BRAKE-DISC-Z"]) {
    assert.equal(resolveCase(reference, FIXTURE_CASES)?.case_id, "C04-BRAKE-DISC", reference);
  }
});

test("an unknown value resolves to nothing, so the caller cannot navigate", () => {
  for (const reference of ["", "   ", "ZZZ-999", "DN-99", "INV-1", "RC-1"]) {
    assert.equal(resolveCase(reference, FIXTURE_CASES), null, reference);
  }
});

test("catalogue rows are only resolvable when the catalogue is present", () => {
  // Supabase unreachable: only the labelled local fallback remains.
  assert.equal(resolveCase("PO-1", [LOCAL_FALLBACK_CASE])?.case_id, "C04-FILTER-X");
  assert.equal(resolveCase("DN-20", [LOCAL_FALLBACK_CASE]), null);
});

test("OCR text yields the reference candidates without inventing any", () => {
  const known = knownIdentifiers(FIXTURE_CASES);
  assert.deepEqual(extractCandidates("Delivery note DN-20  PO-20", known), ["DN-20", "PO-20"]);
  assert.deepEqual(extractCandidates("dn 30 / brake-disc-z", known), ["DN-30", "BRAKE-DISC-Z"]);
  assert.deepEqual(extractCandidates("", known), []);
  assert.deepEqual(extractCandidates("no reference on this label", known), []);
});

test("OCR normalisation uppercases and strips separators", () => {
  assert.equal(normalizeReference("  dn-1 "), "DN-1");
  assert.equal(normalizeReference("Filter\tX"), "FILTERX");
});

test("a normalised OCR candidate still has to be a real case before navigating", () => {
  const known = knownIdentifiers(FIXTURE_CASES);
  const [candidate] = extractCandidates("Ref: DN-20 please check", known);
  assert.equal(candidate, "DN-20");
  // The confirmation step passes the (editable) value through the same lookup.
  assert.equal(resolveCase(candidate, FIXTURE_CASES)?.part_number, "AIR-FILTER-Y");
  // A syntactically valid but unknown reference may still be extracted as a
  // candidate — it is the lookup, not the regex, that decides whether we may navigate.
  assert.deepEqual(extractCandidates("Ref: DN-77 please check", known), ["DN-77"]);
  assert.equal(resolveCase("DN-77", FIXTURE_CASES), null);
});

test("invoice ids are never lookup keys", () => {
  const known = knownIdentifiers(FIXTURE_CASES);
  assert.ok(!known.includes("INV-1"));
  assert.equal(resolveCase("INV-20", FIXTURE_CASES), null);
});
