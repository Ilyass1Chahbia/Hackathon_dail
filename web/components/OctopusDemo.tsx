"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  DecisionKind,
  EvidenceLink,
  Observation,
  PersistenceInfo,
  ReconcileResult,
  SuppliedRecords,
} from "@/lib/types";
import type { PersistedDecision, PersistedEvent } from "@/lib/persistence";
import { LOCAL_FALLBACK_CASE, knownIdentifiers, resolveCase, type DemoCase } from "@/lib/cases";
import CameraScanner from "./CameraScanner";
import { Banner, Btn, Card, Chip, Metric, Panel, Row } from "./ui";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClipboard,
  IconInfo,
  IconInvoice,
  IconLayers,
  IconPackage,
  IconPallet,
  IconTruck,
  IconUser,
} from "./icons";

interface RevealedReceipt {
  id: string;
  delivery_note: string;
  received: number;
  damaged: number;
  accepted: number;
}

interface RevealedDeliveryNote {
  id: string;
  order_id: string;
  part: string;
  listed_quantity: number;
}

type ScanState = null | "open" | "same_package" | "left_uncertain";
type Stage = "receipt" | "reconcile" | "review";

const STAGES: { id: Stage; label: string }[] = [
  { id: "receipt", label: "Receipt" },
  { id: "reconcile", label: "Reconcile" },
  { id: "review", label: "Review" },
];

/**
 * The single identifier lookup for the whole app: manual entry, QR/barcode decoding,
 * OCR confirmation and the catalogue rows all resolve through `resolveCase`.
 */
export default function OctopusDemo({ records }: { records: SuppliedRecords }) {
  const order = records.orders[0];
  const suppliedRc1 = records.receipts.find((r) => r.id === "RC-1")!;
  const suppliedDn1 = records.delivery_notes.find((d) => d.id === "DN-1")!;
  const suppliedInv1 = records.invoices.find((i) => i.id === "INV-1")!;

  // --- stage -----------------------------------------------------------------
  const [stage, setStage] = useState<Stage>("receipt");

  // --- receipt entry screen (before the dashboard) ---------------------------
  const [caseOpen, setCaseOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const scanButtonRef = useRef<HTMLButtonElement | null>(null);

  // --- demo-case catalogue (Supabase) ---------------------------------------
  const [catalog, setCatalog] = useState<DemoCase[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<DemoCase>(LOCAL_FALLBACK_CASE);

  /** Catalogue when Supabase answers; otherwise only the labelled local DN-1 fallback. */
  const caseList = useMemo<DemoCase[]>(
    () => (catalog.length > 0 ? catalog : [LOCAL_FALLBACK_CASE]),
    [catalog],
  );

  const isSuppliedCase = selectedCase.case_id === LOCAL_FALLBACK_CASE.case_id;
  const fx = selectedCase.fixture;
  const part = isSuppliedCase ? order?.part ?? "FILTER-X" : selectedCase.part_number;
  /** Every identifier the scanner and OCR may legitimately resolve to. */
  const knownIds = useMemo(() => knownIdentifiers(caseList), [caseList]);

  // --- capture state -------------------------------------------------------
  const [received, setReceived] = useState(LOCAL_FALLBACK_CASE.fixture.initial_received);
  const [damaged, setDamaged] = useState(LOCAL_FALLBACK_CASE.fixture.damaged);
  const accepted = Math.max(received - damaged, 0);

  // --- workflow state ------------------------------------------------------
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);
  const [evidenceLinked, setEvidenceLinked] = useState(false);
  const [rc2, setRc2] = useState<{ receipt: RevealedReceipt; note: RevealedDeliveryNote } | null>(null);
  const [scan, setScan] = useState<ScanState>(null);
  const [beforeRc2, setBeforeRc2] = useState<ReconcileResult | null>(null);
  const [lastScanResult, setLastScanResult] = useState<ReconcileResult | null>(null);

  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const [persistence, setPersistence] = useState<PersistenceInfo | null>(null);
  const [events, setEvents] = useState<PersistedEvent[]>([]);
  const [decisions, setDecisions] = useState<PersistedDecision[]>([]);
  const [decision, setDecision] = useState<{ kind: DecisionKind; correction: string | null } | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const observations = useMemo<Observation[]>(() => {
    const list: Observation[] = [];
    if (receiptConfirmed) {
      list.push({
        id: "OBS-1",
        kind: "delivery",
        received,
        damaged,
        source_record: isSuppliedCase ? "RC-1" : fx.initial_receipt,
        delivery_note: isSuppliedCase ? "DN-1" : selectedCase.delivery_note,
        label: isSuppliedCase
          ? "Receipt observation confirmed at the bay (demo replay of supplied RC-1)"
          : `Receipt observation confirmed at the bay (synthetic ${selectedCase.case_id} fixture)`,
      });
    }
    if (rc2) {
      list.push({
        id: "OBS-2",
        kind: "delivery",
        received: rc2.receipt.received,
        damaged: rc2.receipt.damaged,
        source_record: "RC-2",
        delivery_note: "DN-2",
        label: "Simulated later delivery (demo replay of supplied RC-2)",
      });
    }
    if (scan === "open") {
      list.push({
        id: "OBS-SCAN-1",
        kind: "repeated_scan",
        received: 1,
        damaged: 0,
        package_identity: null,
        label: "Simulated repeated scan — no unique package identity",
      });
    }
    return list;
  }, [receiptConfirmed, received, damaged, rc2, scan]);

  const evidenceLink = useMemo<EvidenceLink>(
    () => ({
      // Supplied record ids are linked only for the supplied FILTER-X case. A catalogue
      // case contributes its own snapshot instead, so no supplied record is implied.
      order_ids: evidenceLinked && isSuppliedCase && order ? [order.id] : [],
      delivery_note_ids: isSuppliedCase ? (rc2 ? ["DN-1", "DN-2"] : ["DN-1"]) : [],
      receipt_ids: receiptConfirmed && isSuppliedCase ? (rc2 ? ["RC-1", "RC-2"] : ["RC-1"]) : [],
      invoice_ids: evidenceLinked && isSuppliedCase ? ["INV-1"] : [],
      observations,
      facts: isSuppliedCase
        ? undefined
        : {
            case_id: selectedCase.case_id,
            part_number: selectedCase.part_number,
            ordered: fx.ordered,
            invoiced: evidenceLinked ? fx.invoiced : null,
          },
    }),
    [evidenceLinked, order, rc2, receiptConfirmed, observations, isSuppliedCase, selectedCase, fx],
  );

  const linkKey = JSON.stringify(evidenceLink);

  const refreshHistory = useCallback(async () => {
    const response = await fetch("/api/history", { cache: "no-store" });
    const payload = await response.json();
    setPersistence(payload.persistence);
    setEvents(payload.events ?? []);
    setDecisions(payload.decisions ?? []);
  }, []);

  /** Reads the synthetic catalogue. A failure is reported, never papered over. */
  const refreshCatalog = useCallback(async () => {
    try {
      const response = await fetch("/api/cases", { cache: "no-store" });
      const payload = await response.json();
      setCatalog((payload.cases ?? []) as DemoCase[]);
      setCatalogError(payload.error ?? null);
      if (payload.persistence) setPersistence(payload.persistence);
    } catch (error) {
      setCatalog([]);
      setCatalogError(String(error));
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
    void refreshCatalog();
  }, [refreshHistory, refreshCatalog]);

  const postEvent = useCallback(
    async (kind: string, payload: Record<string, unknown>) => {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, payload }),
      });
      const ack = await response.json();
      setPersistence(ack.persistence);
      await refreshHistory();
      return ack as { persisted: boolean };
    },
    [refreshHistory],
  );

  // Deterministic recalculation: fires whenever the evidence set changes.
  useEffect(() => {
    if (!receiptConfirmed) return;
    let cancelled = false;
    setBusy("Running deterministic reconciliation…");
    (async () => {
      try {
        const response = await fetch("/api/reconcile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: linkKey,
        });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setWorkflowError(`${payload.error} — ${payload.detail ?? ""}`);
          setResult(null);
        } else {
          setWorkflowError(null);
          setResult(payload as ReconcileResult);
        }
      } catch (error) {
        if (!cancelled) {
          setWorkflowError(`Deterministic workflow unreachable — ${String(error)}`);
          setResult(null);
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkKey, receiptConfirmed]);

  const q = result?.quantities;
  const diagnosis = result?.diagnosis;
  const isUncertain = diagnosis?.status === "insufficient_evidence";

  // --- actions -------------------------------------------------------------
  const confirmReceipt = async () => {
    setReceiptConfirmed(true);
    setFlash(null);
    await postEvent("receipt_confirmed", {
      observation_id: "OBS-1",
      source_record: "RC-1",
      delivery_note: "DN-1",
      received,
      damaged,
      accepted: received - damaged,
      note: "Demo replay of supplied synthetic RC-1",
    });
    setStage("reconcile");
  };

  const linkEvidence = async () => {
    setEvidenceLinked(true);
    await postEvent("evidence_linked", {
      order_ids: [order?.id ?? "PO-1"],
      delivery_note_ids: ["DN-1"],
      receipt_ids: ["RC-1"],
      invoice_ids: ["INV-1"],
    });
  };

  const simulateRc2 = async () => {
    setBusy("Revealing supplied RC-2…");
    try {
      const [receiptRes, noteRes] = await Promise.all([
        fetch("/api/records/receipt/RC-2", { cache: "no-store" }),
        fetch("/api/records/delivery_note/DN-2", { cache: "no-store" }),
      ]);
      const receiptPayload = await receiptRes.json();
      const notePayload = await noteRes.json();
      if (!receiptRes.ok || !noteRes.ok) {
        setWorkflowError(
          `${receiptPayload.error ?? notePayload.error} — ${receiptPayload.detail ?? notePayload.detail ?? ""}`,
        );
        return;
      }
      setBeforeRc2(result);
      setRc2({ receipt: receiptPayload, note: notePayload });
      setScan(null);
      setFlash("RC-2 revealed from source/initial.json (read-only) and sent to the deterministic workflow.");
      await postEvent("rc2_simulated", {
        revealed_receipt: receiptPayload,
        revealed_delivery_note: notePayload,
        note: "SIMULATION — supplied RC-2 revealed without modifying source/initial.json",
      });
    } finally {
      setBusy(null);
    }
  };

  const simulateRepeatedScan = async () => {
    setLastScanResult(result);
    setScan("open");
    setFlash(null);
    await postEvent("repeated_scan_simulated", {
      observation_id: "OBS-SCAN-1",
      package_identity: null,
      received_quantity_changed: false,
      note: "SIMULATION — repeated scan without unique package identity",
    });
  };

  const resolveScan = async (choice: "same_package" | "left_uncertain") => {
    setScan(choice);
    await postEvent("scan_review_resolved", {
      observation_id: "OBS-SCAN-1",
      reviewer_confirmation: choice,
      received_quantity_changed: false,
    });
  };

  const submitDecision = async (kind: DecisionKind) => {
    setDecisionError(null);
    if (kind === "corrected" && !correctionDraft.trim()) {
      setDecisionError("A correction note is required when correcting the explanation.");
      return;
    }
    const response = await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: kind,
        explanation: diagnosis?.explanation ?? "",
        correction: kind === "corrected" ? correctionDraft.trim() : null,
        engine_version: result?.workflow.engine_version ?? "unknown",
        snapshot: {
          quantities: q,
          diagnosis_code: diagnosis?.code,
          next_action: result?.next_action.text,
          record_fingerprint: result?.record_fingerprint,
        },
      }),
    });
    const ack = await response.json();
    if (!response.ok) {
      setDecisionError(ack.error ?? "Unable to persist the decision.");
      return;
    }
    setDecision({ kind, correction: kind === "corrected" ? correctionDraft.trim() : null });
    setPersistence(ack.persistence);
    await refreshHistory();
  };

  const resetDemo = async () => {
    setBusy("Resetting…");
    try {
      await fetch("/api/reset", { method: "POST" });
      setReceived(suppliedRc1.received);
      setDamaged(suppliedRc1.damaged);
      setReceiptConfirmed(false);
      setEvidenceLinked(false);
      setRc2(null);
      setScan(null);
      setBeforeRc2(null);
      setLastScanResult(null);
      setResult(null);
      setDecision(null);
      setCorrectionDraft("");
      setDecisionError(null);
      setWorkflowError(null);
      setFlash("Demo reset to the exact initial state. Supplied records were never modified.");
      setStage("receipt");
      await refreshHistory();
    } finally {
      setBusy(null);
    }
  };

  // --- entry screen actions ------------------------------------------------
  /** The one lookup. An unresolved reference never navigates. */
  const openCase = useCallback(
    (raw: string, missMessage = "No matching expected delivery found") => {
      const resolved = resolveCase(raw, caseList);
      if (!resolved) {
        setLookupError(missMessage);
        return;
      }
      setLookupError(null);
      setSelectedCase(resolved);
      setReceived(resolved.fixture.initial_received);
      setDamaged(resolved.fixture.damaged);
      setReceiptConfirmed(false);
      setEvidenceLinked(false);
      setRc2(null);
      setScan(null);
      setResult(null);
      setLastScanResult(null);
      setBeforeRc2(null);
      setWorkflowError(null);
      setCaseOpen(true);
      setStage("receipt");
    },
    [caseList],
  );

  const submitIdentifier = (event: FormEvent) => {
    event.preventDefault();
    openCase(identifier);
  };

  const clearIdentifier = () => {
    setIdentifier("");
    setLookupError(null);
  };

  /** Returns to the picker without discarding the selected case's progress. */
  const chooseAnotherDelivery = () => {
    setCaseOpen(false);
    setIdentifier("");
    setLookupError(null);
  };

  // --- camera scanner -------------------------------------------------------
  const closeScanner = useCallback(() => {
    setScannerOpen(false);
    scanButtonRef.current?.focus();
  }, []);

  /** A decoded barcode, an OCR confirmation and a simulated read all land here. */
  const handleScanned = useCallback(
    (code: string) => {
      setScannerOpen(false);
      openCase(code, "No matching expected delivery found. Check the reference or enter it manually.");
      scanButtonRef.current?.focus();
    },
    [openCase],
  );

  const persistenceMemory = (persistence?.mode ?? "memory") === "memory";
  const done: Record<Stage, boolean> = {
    receipt: receiptConfirmed,
    reconcile: Boolean(result),
    review: Boolean(decision),
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* global top header — identity + status only */}
      <div className="sticky top-0 z-30">
        <header className="border-b border-trast-violet/15 bg-trast-white">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-[3px] bg-trast-violet px-3 py-1.5 text-xs font-semibold tracking-[0.08em] text-white">
                <IconLayers className="h-4 w-4" />
                Octopus C04
              </span>
              <span className="text-sm font-semibold tracking-[0.02em] text-trast-ink">
                {caseOpen ? `${part} · ${order?.id ?? "PO-1"}` : "No delivery selected"}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Chip tone="synthetic">
                <IconAlert className="h-3.5 w-3.5" />
                Synthetic data
              </Chip>
              {persistence && !persistenceMemory ? (
                <Chip tone="connected">
                  <IconCheck className="h-3.5 w-3.5" />
                  Supabase connected
                </Chip>
              ) : null}
              {caseOpen ? (
                <Btn variant="quiet" onClick={chooseAnotherDelivery}>
                  Choose another delivery
                </Btn>
              ) : null}
            </div>
          </div>
        </header>

        {/* workflow navigation row — below the header, above the page title */}
        {caseOpen ? (
          <nav aria-label="Workflow stages" className="border-b border-trast-violet/15 bg-trast-white">
            <div className="mx-auto max-w-[1440px] px-6 py-2 sm:px-8">
              <ol className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
                {STAGES.map((item, index) => {
                  const active = stage === item.id;
                  const complete = done[item.id];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setStage(item.id)}
                        aria-current={active ? "step" : undefined}
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-[6px] border px-3.5 py-2 text-[13px] font-semibold tracking-[0.08em] transition-colors sm:w-auto ${
                          active
                            ? "border-trast-ultra bg-trast-ultra text-white"
                            : complete
                              ? "border-trast-violet/55 bg-trast-white text-trast-violet hover:border-trast-violet hover:bg-trast-violet/5"
                              : "border-trast-blue/45 bg-trast-white text-trast-ink hover:border-trast-blue hover:bg-trast-blue/5"
                        }`}
                      >
                        {complete && !active ? (
                          <IconCheck className="h-4 w-4" />
                        ) : (
                          <span className="tabular text-xs opacity-70">{index + 1}</span>
                        )}
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </nav>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 pb-16 pt-5 sm:px-8">
        {/* one warning only, carrying the real error, never softened */}
        {persistence && persistenceMemory ? (
          <Banner tone="amber" title={persistence.label} glyph={<IconAlert />}>
            {persistence.detail}
          </Banner>
        ) : null}

        {workflowError ? (
          <div role="alert" className="mt-3">
            <Banner tone="rose" title="Deterministic workflow unavailable." glyph={<IconAlert />}>
              {workflowError} The reviewer stays in control; no quantity is changed while the workflow is offline.
            </Banner>
          </div>
        ) : null}

        {flash ? (
          <div className="mt-3">
            <Banner tone="sky" title="Simulation notice:" glyph={<IconInfo />}>
              {flash}
            </Banner>
          </div>
        ) : null}

        {!caseOpen ? (
          <Card className="mt-5">
            <div className="bg-trast-violet px-6 py-5 text-white sm:px-7">
              <div className="text-xs font-semibold tracking-[0.12em] text-white/75">
                Octopus C04 · parts receiving
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Start a receipt</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/90">
                Record what arrives at the bay. Scan the pallet, or type one reference — no product-by-product entry and
                no invoice number.
              </p>
            </div>

            <div className="grid gap-6 px-6 py-6 sm:px-7 lg:grid-cols-2">
              <div>
                <div className="text-xs font-semibold tracking-[0.08em] text-trast-ink/70">Scan</div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                  Scan the barcode on the pallet or package label to pull the expected delivery for this bay.
                </p>
                <Btn
                  ref={scanButtonRef}
                  variant="action"
                  onClick={() => setScannerOpen(true)}
                  className="mt-3"
                >
                  <IconPackage className="h-4 w-4" />
                  Scan pallet or package
                </Btn>
                <p className="mt-2 text-xs leading-relaxed text-ink/65">
                  Camera scanning is real — 1D and 2D barcodes, rear camera where available — and needs localhost or
                  HTTPS. The barcode-to-ERP lookup behind it is mocked against the supplied synthetic records.
                </p>
              </div>

              <form onSubmit={submitIdentifier}>
                <label htmlFor="shipment-reference" className="block text-sm font-medium text-ink/75">
                  Delivery note, purchase order or shipment reference
                </label>
                <input
                  id="shipment-reference"
                  name="shipment-reference"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="e.g. DN-1"
                  autoComplete="off"
                  className="mt-1.5 w-full rounded-[4px] border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-trast-blue focus:outline-none"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Btn type="submit" variant="outline">
                    Find expected delivery
                  </Btn>
                  <Btn variant="quiet" type="button" onClick={clearIdentifier}>
                    Clear
                  </Btn>
                </div>
                {lookupError ? (
                  <p role="alert" className="mt-2 text-sm font-semibold text-danger">
                    {lookupError}
                  </p>
                ) : null}
              </form>

              <div className="border-t border-ink/10 pt-5 lg:col-span-2">
                <Btn variant="simulation" onClick={() => openCase("DN-1")}>
                  <IconTruck className="h-4 w-4" />
                  Simulation — load supplied case DN-1 · FILTER-X
                </Btn>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-ink/65">
                  In production the expected shipment — delivery note, purchase order and part — would come from the
                  supplier/ERP integration. Here that lookup is mocked and read from the supplied synthetic records in
                  source/initial.json. The camera itself is real, but no supplier, inventory or accounting action is
                  executed.
                </p>
              </div>

              <div className="border-t border-ink/10 pt-5 lg:col-span-2">
                <h2 className="text-xs font-semibold tracking-[0.08em] text-trast-ink/70">Expected deliveries</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink/65">
                  Synthetic catalogue, read from Supabase — this stands in for the mocked ERP/order lookup. Selecting a
                  row runs the same identifier lookup as a scan, an OCR read or manual entry.
                </p>
                <ul className="mt-3 grid gap-2">
                  {caseList.map((demoCase) => (
                    <li key={demoCase.case_id}>
                      <button
                        type="button"
                        onClick={() => openCase(demoCase.delivery_note)}
                        className="min-h-[44px] w-full rounded-[4px] border border-trast-blue/35 bg-white px-3.5 py-3 text-left transition-colors hover:border-trast-blue hover:bg-trast-blue/5"
                      >
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-mono text-sm font-semibold text-trast-ink">{demoCase.delivery_note}</span>
                          <span className="font-mono text-xs text-trast-ink/70">{demoCase.purchase_order}</span>
                          <span className="text-sm font-semibold text-trast-ink">{demoCase.part_number}</span>
                          <Chip tone="synthetic">
                            <IconAlert className="h-3.5 w-3.5" />
                            Synthetic
                          </Chip>
                        </span>
                        <span className="mt-1 block text-xs text-trast-ink/70">
                          {demoCase.display_name} · expected order {demoCase.fixture.ordered} · received{" "}
                          {demoCase.fixture.initial_received} · damaged {demoCase.fixture.damaged} · accepted{" "}
                          {demoCase.fixture.accepted}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {catalogError ? (
                  <p className="mt-2 text-xs leading-relaxed text-danger">
                    Catalogue unavailable — showing the labelled local fallback only. Reported: {catalogError}
                  </p>
                ) : null}
                {catalog.length > 0 ? null : (
                  <p className="mt-2 text-xs leading-relaxed text-ink/65">
                    Local demo fallback: {LOCAL_FALLBACK_CASE.delivery_note} · {LOCAL_FALLBACK_CASE.purchase_order} ·{" "}
                    {LOCAL_FALLBACK_CASE.part_number} — the supplied case, always available offline.
                  </p>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <>
        {/* compact title row */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              Receipt capture &amp; discrepancy review — {part}
            </h1>
            <p className="text-sm text-ink/70">
              Record what actually arrived, link the delivery and invoice evidence, review the difference.
            </p>
          </div>
          <span className="font-mono text-xs text-ink/55">records sha256 {records.fingerprint.slice(0, 12)}…</span>
        </div>

        {/* quantity strip — six modular blocks, 3px radii, narrow gaps */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric
            label="Ordered"
            value={isSuppliedCase ? order?.quantity ?? "—" : fx.ordered}
            unit="unit(s)"
            tone="violet"
            filled
            icon={<IconPallet />}
            caption={isSuppliedCase ? "supplied PO-1" : `catalogue · ${selectedCase.purchase_order}`}
          />
          <Metric
            label="Received"
            value={q ? q.received : "—"}
            unit="unit(s)"
            tone="blue"
            filled={Boolean(q?.received)}
            icon={<IconPackage />}
            caption={q?.received ? "source RC-1" : "not recorded"}
          />
          <Metric
            label="Damaged"
            value={q ? q.damaged : "—"}
            unit="unit(s)"
            tone="coral"
            filled={Boolean(q && q.damaged > 0)}
            icon={<IconAlert />}
            caption="kept separate"
          />
          <Metric
            label="Accepted"
            value={q ? q.accepted : "—"}
            unit="unit(s)"
            tone="ultra"
            filled={Boolean(q)}
            icon={<IconCheck />}
            caption="received − damaged"
          />
          <Metric
            label="Invoiced"
            value={q?.invoiced ?? "—"}
            unit="unit(s)"
            tone={q && q.invoiced !== null ? "violet" : "neutral"}
            icon={<IconInvoice />}
            caption={!q || q.invoiced === null ? "no invoice linked" : "supplied INV-1"}
          />
          <Metric
            label="Difference"
            value={q ? (q.possible_shortage ?? "—") : "—"}
            unit="unit(s)"
            tone={
              !q || q.invoiced === null ? "neutral" : q.possible_shortage ? "pink" : "blue"
            }
            filled={Boolean(q && q.invoiced !== null)}
            icon={q?.possible_shortage ? <IconAlert /> : <IconCheck />}
            caption={!q || q.invoiced === null ? "no invoice linked" : "invoiced − received"}
          />
        </div>

        {/* ---------------- stage 1: receipt ---------------- */}
        {stage === "receipt" ? (
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
            <Panel
              tone="sky"
              icon={<IconClipboard />}
              title="Fast receipt capture"
              badge={
                <>
                  <Chip tone="demo">
                    <IconInfo className="h-3.5 w-3.5" />
                    Demo replay · supplied RC-1
                  </Chip>
                  <Chip tone="linked">
                    <IconCheck className="h-3.5 w-3.5" />
                    DN-1 linked
                  </Chip>
                </>
              }
              className="lg:col-span-2"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Stepper label="Received at the bay" value={received} onChange={setReceived} />
                <Stepper label="Damage exception" value={damaged} onChange={setDamaged} tone="rose" />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-success/25 bg-tint-success px-4 py-3">
                <div className="flex items-center gap-2">
                  <IconCheck className="h-5 w-5 text-success" />
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink/60">Accepted (calculated)</div>
                    <div className="font-mono text-xs text-ink/70">
                      received {received} − damaged {damaged} = {accepted}
                    </div>
                  </div>
                </div>
                <span className="tabular text-3xl font-semibold leading-none text-success">{accepted}</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Btn variant="primary" onClick={confirmReceipt} disabled={receiptConfirmed || Boolean(busy)}>
                  <IconClipboard className="h-4 w-4" />
                  Confirm receipt observation
                </Btn>
                {receiptConfirmed ? (
                  <Chip tone="connected">
                    <IconCheck className="h-3.5 w-3.5" />
                    Observation confirmed
                  </Chip>
                ) : null}
              </div>

              <p className="mt-3 text-xs leading-relaxed text-ink/65">
                This panel replays the supplied synthetic record RC-1. Received, damaged and accepted quantities are
                kept separate (supplied rule 1). No stock, accounting or supplier action is executed.
              </p>
            </Panel>

            <Panel tone="sky" icon={<IconTruck />} title="Delivery evidence">
              <Row k="Replayed record" v={`${suppliedRc1.id} · supplied synthetic data`} mono />
              <Row k="Delivery note" v={`${suppliedDn1.id} (listed ${suppliedDn1.listed_quantity}) for PO-1`} />
              <Row k="Part" v={`${part} × ${order?.quantity ?? "?"} ordered`} />
              <Row k="Pre-filled" v={`received ${suppliedRc1.received}, damaged ${suppliedRc1.damaged}`} mono />
              <p className="mt-3 text-xs leading-relaxed text-ink/65">
                The invoice is not linked yet — the arrival is recorded first, the comparison happens in Reconcile.
              </p>
            </Panel>
          </div>
        ) : null}

        {/* ---------------- stage 2: reconcile ---------------- */}
        {stage === "reconcile" ? (
          !receiptConfirmed ? (
            <Prerequisite
              message="Confirm the receipt observation first."
              action="Go to Receipt"
              onAction={() => setStage("receipt")}
            />
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Panel
                  tone="violet"
                  icon={<IconLayers />}
                  title="Evidence"
                  badge={
                    <Chip tone={evidenceLinked ? "linked" : "slate"}>
                      {evidenceLinked ? <IconCheck className="h-3.5 w-3.5" /> : <IconInfo className="h-3.5 w-3.5" />}
                      {evidenceLinked ? "Evidence linked" : "Not linked yet"}
                    </Chip>
                  }
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Btn variant="primary" onClick={linkEvidence} disabled={evidenceLinked}>
                      <IconLayers className="h-4 w-4" />
                      Link evidence and reconcile
                    </Btn>
                    {!evidenceLinked ? (
                      <span className="text-xs text-ink/65">
                        Links PO-1, DN-1, the visible RC-1 and INV-1, then recalculates.
                      </span>
                    ) : null}
                  </div>

                  <ol className="relative mt-4 space-y-2.5 border-l border-dashed border-ink/15 pl-6">
                    <EvidenceNode
                      icon={<IconPallet />}
                      id={order?.id ?? "PO-1"}
                      label={`Purchase order · ${part} × ${order?.quantity ?? "?"}`}
                      note="Expectation source"
                      linked
                    />
                    <EvidenceNode
                      icon={<IconTruck />}
                      id="DN-1"
                      label={`Delivery note · ${part} × ${suppliedDn1.listed_quantity}`}
                      note="Declared at dispatch"
                      linked
                    />
                    <EvidenceNode
                      icon={<IconPackage />}
                      id="RC-1"
                      label={`Receipt observation · received ${suppliedRc1.received} / damaged ${suppliedRc1.damaged}`}
                      note={receiptConfirmed ? "Visible · confirmed at the bay" : "Visible once the receipt is confirmed"}
                      linked={receiptConfirmed}
                    />
                    <EvidenceNode
                      icon={<IconClipboard />}
                      id="Inspection"
                      label={`Inspection · damage exception ${suppliedRc1.damaged} of ${suppliedRc1.received}`}
                      note={receiptConfirmed ? `Recorded at the bay · accepted ${accepted}` : "Recorded with the receipt"}
                      linked={receiptConfirmed}
                    />
                    <EvidenceNode
                      icon={<IconInvoice />}
                      id={suppliedInv1.id}
                      label={`Invoice · ${part} × ${suppliedInv1.quantity}`}
                      note="Bills DN-1 and DN-2"
                      linked={evidenceLinked}
                    />
                  </ol>

                  {result && q ? (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-ink">Conclusions, sources and calculations</h3>
                      <div className="mt-2 divide-y divide-ink/[0.07] overflow-hidden rounded-card border border-ink/10">
                        {result.conclusions.map((conclusion) => (
                          <div key={conclusion.id} className="grid gap-1.5 px-4 py-3 md:grid-cols-[1fr_auto]">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-ink">{conclusion.label}</div>
                              <dl className="mt-0.5 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                                <div className="flex gap-1.5">
                                  <dt className="text-ink/55">Source:</dt>
                                  <dd className="font-mono text-ink/75">{conclusion.source.join(", ") || "—"}</dd>
                                </div>
                                <div className="flex gap-1.5">
                                  <dt className="text-ink/55">Calculation:</dt>
                                  <dd className="font-mono text-ink/75">{conclusion.calculation}</dd>
                                </div>
                              </dl>
                            </div>
                            <div className="tabular self-center text-lg font-semibold text-ink md:text-right">
                              {conclusion.value}
                              {conclusion.unit ? (
                                <span className="ml-1.5 text-xs font-medium text-ink/60">{conclusion.unit}</span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>

                      <details className="mt-3 rounded-card border border-ink/10 bg-canvas/60 px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-ink">
                          Linked evidence ({result.evidence.length}) and supplied rules
                        </summary>
                        <ul className="mt-3 space-y-2.5">
                          {result.evidence.map((item) => (
                            <li key={item.id} className="text-xs leading-relaxed text-ink/70">
                              <span className="font-mono font-medium text-ink">{item.id}</span> — {item.label}
                              <div className="text-ink/55">
                                {item.detail} · {item.source}
                              </div>
                            </li>
                          ))}
                        </ul>
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink/60">
                          {records.rules.map((rule) => (
                            <li key={rule}>{rule}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  ) : null}
                </Panel>
              </div>

              <div className="space-y-4">
                <DiagnosisPanel result={result} isUncertain={isUncertain} />

                <Panel
                  tone="amber"
                  icon={<IconTruck />}
                  title="Second delivery (simulated)"
                  badge={
                    <Chip tone="demo">
                      <IconInfo className="h-3.5 w-3.5" />
                      Simulation
                    </Chip>
                  }
                >
                  <p className="text-xs leading-relaxed text-ink/70">
                    Simulated event · no real delivery. Reveals the supplied record RC-2 read-only;
                    source/initial.json is not modified.
                  </p>
                  <Btn
                    variant="primary"
                    onClick={simulateRc2}
                    disabled={!fx.later_simulation || !receiptConfirmed || Boolean(rc2) || Boolean(busy)}
                    className="mt-3"
                  >
                    <IconTruck className="h-4 w-4" />
                    Simulate later delivery RC-2
                  </Btn>

                  {!fx.later_simulation ? (
                    <p className="mt-2 text-xs leading-relaxed text-trast-ink/70">
                      Only the supplied FILTER-X case has a later delivery event. This synthetic catalogue case has no
                      RC-2, so its reconciliation is already complete above.
                    </p>
                  ) : null}

                  {rc2 ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-card border border-warning/30 bg-tint-warning px-4 py-3">
                        <Chip tone="demo">
                          <IconInfo className="h-3.5 w-3.5" />
                          Simulated event · RC-2 revealed
                        </Chip>
                        <div className="mt-2">
                          <Row
                            k="Receipt"
                            v={`${rc2.receipt.id} (received ${rc2.receipt.received}, damaged ${rc2.receipt.damaged})`}
                          />
                          <Row
                            k="Delivery note"
                            v={`${rc2.note.id} · listed ${rc2.note.listed_quantity} on ${rc2.note.order_id}`}
                          />
                          <Row k="Source" v="source/initial.json (read-only)" mono />
                        </div>
                      </div>
                      <div className="rounded-card border border-ink/10 px-4 py-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-ink/60">
                          Recalculated automatically
                        </div>
                        {q ? (
                          <div className="mt-2 space-y-1 font-mono text-sm text-ink">
                            <div>
                              received {beforeRc2?.quantities.received ?? "—"} →{" "}
                              <span className="font-semibold text-blue">{q.received}</span>
                            </div>
                            <div>
                              damaged {beforeRc2?.quantities.damaged ?? "—"} →{" "}
                              <span className="font-semibold text-danger">{q.damaged}</span>
                            </div>
                            <div>
                              accepted {beforeRc2?.quantities.accepted ?? "—"} →{" "}
                              <span className="font-semibold text-success">{q.accepted}</span>
                            </div>
                            <div>
                              possible shortage {beforeRc2?.quantities.possible_shortage ?? "—"} →{" "}
                              <span className="font-semibold text-success">{q.possible_shortage}</span>
                            </div>
                          </div>
                        ) : null}
                        <p className="mt-2 text-xs leading-relaxed text-ink/60">
                          No further prompt was needed: the diagnosis and next action refreshed from the same
                          deterministic run.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </Panel>
              </div>
            </div>
          )
        ) : null}

        {/* ---------------- stage 3: review ---------------- */}
        {stage === "review" ? (
          !result || !diagnosis ? (
            <Prerequisite
              message="Reconcile the arrival first — link the evidence so there is a result to review."
              action="Go to Reconcile"
              onAction={() => setStage("reconcile")}
            />
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                {/* the reconciliation result stays visible before the reviewer decides */}
                <Panel
                  tone="violet"
                  icon={<IconLayers />}
                  title="Reconciliation result to review"
                  badge={
                    <Chip tone={isUncertain ? "rose" : "sky"}>
                      {isUncertain ? <IconAlert className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
                      {diagnosis.code}
                    </Chip>
                  }
                >
                  <p className="text-base font-semibold text-ink">{diagnosis.headline}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink/70">{diagnosis.explanation}</p>
                  <div className="mt-3 rounded-card border border-ink/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/60">
                      <IconArrowRight className="h-4 w-4 text-violet" />
                      Next action
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ink">{result.next_action.text}</p>
                  </div>
                </Panel>

                <Panel
                  tone="emerald"
                  icon={<IconUser />}
                  title="Reviewer decision"
                  subtitle="The receiving lead keeps every decision."
                  badge={
                    decision ? (
                      <Chip tone="connected">
                        <IconCheck className="h-3.5 w-3.5" />
                        Decision recorded
                      </Chip>
                    ) : null
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="primary" onClick={() => submitDecision("approved")} disabled={Boolean(decision)}>
                      <IconCheck className="h-4 w-4" />
                      Approve explanation
                    </Btn>
                    <Btn
                      variant="secondary"
                      onClick={() => submitDecision("corrected")}
                      disabled={Boolean(decision)}
                      title="Requires a correction note"
                    >
                      Correct explanation
                    </Btn>
                    <Btn variant="danger" onClick={() => submitDecision("unresolved")} disabled={Boolean(decision)}>
                      Leave unresolved
                    </Btn>
                  </div>
                  <label className="mt-4 block">
                    <span className="text-xs font-medium text-ink/70">Reviewer correction note</span>
                    <textarea
                      value={correctionDraft}
                      onChange={(event) => setCorrectionDraft(event.target.value)}
                      placeholder="Reviewer correction note (required for 'Correct explanation')"
                      className="mt-1.5 h-24 w-full resize-none rounded-card border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-violet focus:outline-none"
                    />
                  </label>
                  {decisionError ? (
                    <p className="mt-1 text-xs font-medium text-danger" role="alert">
                      {decisionError}
                    </p>
                  ) : null}
                  {decision ? (
                    <p className="mt-2 text-xs leading-relaxed text-ink/75">
                      Recorded: <span className="font-mono">{decision.kind}</span>
                      {decision.correction ? ` — “${decision.correction}”` : ""} · stored as a simulated interaction
                      record · no inventory, accounting or supplier action executed.
                    </p>
                  ) : null}
                </Panel>

                {/* quiet secondary action */}
                <div className="flex flex-wrap items-center gap-3 px-1">
                  <Btn variant="quiet" onClick={resetDemo}>
                    Reset demo to initial state
                  </Btn>
                  <span className="text-xs text-ink/60">source/initial.json is never written to.</span>
                </div>
              </div>

              <div className="space-y-4">
                <Panel
                  tone={isUncertain ? "rose" : "slate"}
                  icon={<IconAlert />}
                  title="Uncertain state — repeated scan without package identity"
                  badge={
                    <Chip tone="demo">
                      <IconInfo className="h-3.5 w-3.5" />
                      Simulation
                    </Chip>
                  }
                >
                  <Btn
                    variant="secondary"
                    onClick={simulateRepeatedScan}
                    disabled={scan === "open"}
                    className="w-full sm:w-auto"
                  >
                    <IconAlert className="h-4 w-4" />
                    Simulate repeated scan (no unique package identity)
                  </Btn>

                  {scan === "same_package" ? (
                    <Chip tone="connected" className="mt-3">
                      <IconCheck className="h-3.5 w-3.5" />
                      Reviewer: same physical package
                    </Chip>
                  ) : null}
                  {scan === "left_uncertain" ? (
                    <Chip tone="amber" className="mt-3">
                      <IconAlert className="h-3.5 w-3.5" />
                      Reviewer: left unresolved
                    </Chip>
                  ) : null}

                  {isUncertain ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-card border border-danger/30 bg-tint-danger px-4 py-3 text-sm leading-relaxed text-ink">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <IconAlert className="h-4 w-4 text-danger" />
                          Insufficient evidence.
                        </span>{" "}
                        {diagnosis.explanation}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Btn variant="primary" onClick={() => resolveScan("same_package")}>
                          <IconCheck className="h-4 w-4" />
                          Reviewer confirms: same package, no quantity change
                        </Btn>
                        <Btn variant="danger" onClick={() => resolveScan("left_uncertain")}>
                          <IconAlert className="h-4 w-4" />
                          Reviewer confirms: leave uncertain pending evidence
                        </Btn>
                      </div>
                      <p className="text-xs text-ink/60">
                        {lastScanResult
                          ? `Received quantity before the scan: ${lastScanResult.quantities.received}. After the scan: ${q?.received}.`
                          : null}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-relaxed text-ink/65">
                      Not triggered. When it is, the received quantity must not increase and the reviewer must confirm
                      the physical identity of the package.
                    </p>
                  )}
                </Panel>

                <Panel tone="slate" icon={<IconPackage />} title="Recorded history">
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-ink/60">
                        Simulated events ({events.length})
                      </div>
                      <ul className="mt-1.5 space-y-1 font-mono text-xs text-ink/75">
                        {events.slice(-6).map((event) => (
                          <li key={`${event.id}-${event.created_at}`}>
                            #{event.id} {event.kind}
                          </li>
                        ))}
                        {events.length === 0 ? <li className="text-ink/45">none yet</li> : null}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-ink/60">
                        Human decisions ({decisions.length})
                      </div>
                      <ul className="mt-1.5 space-y-1 font-mono text-xs text-ink/75">
                        {decisions.slice(-6).map((row) => (
                          <li key={`${row.id}-${row.created_at}`}>
                            #{row.id} {row.decision}
                            {row.correction ? ` — ${row.correction.slice(0, 40)}` : ""}
                          </li>
                        ))}
                        {decisions.length === 0 ? <li className="text-ink/45">none yet</li> : null}
                      </ul>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          )
        ) : null}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-ink/10 bg-white/70">
        <div className="mx-auto max-w-[1440px] px-6 py-5 text-xs leading-relaxed text-ink/60 sm:px-8">
          Fictional exercise inspired by real workflow patterns. All records are synthetic. RC-1 and RC-2 are demo
          replays of supplied data, and RC-2, the repeated scan and every simulation button are labelled simulations.
          No supplier message, inventory update or accounting entry is executed. This prototype is not an official
          client service.
          <div className="mt-1 text-ink/55">
            {records.data_status} · {records.clock}
          </div>
        </div>
      </footer>

      {scannerOpen ? (
        <CameraScanner knownCases={knownIds} onDetected={handleScanned} onClose={closeScanner} />
      ) : null}
    </div>
  );
}

function Prerequisite({
  message,
  action,
  onAction,
}: {
  message: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Card className="mt-4 p-6" accent="slate">
      <p className="text-sm text-ink/75">{message}</p>
      <Btn variant="secondary" onClick={onAction} className="mt-3">
        {action}
      </Btn>
    </Card>
  );
}

function DiagnosisPanel({ result, isUncertain }: { result: ReconcileResult | null; isUncertain: boolean }) {
  const diagnosis = result?.diagnosis;
  return (
    <Panel
      tone={isUncertain ? "rose" : "violet"}
      icon={isUncertain ? <IconAlert /> : <IconLayers />}
      title="Diagnosis"
      badge={
        result ? (
          <>
            <Chip tone={isUncertain ? "rose" : "violet"}>
              {isUncertain ? <IconAlert className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
              {diagnosis?.code}
            </Chip>
            <Chip tone="slate">confidence {diagnosis?.confidence}</Chip>
          </>
        ) : null
      }
    >
      {!result || !diagnosis ? (
        <p className="text-sm text-ink/70">Confirm the receipt observation to run the workflow.</p>
      ) : (
        <>
          {diagnosis.requires_reviewer_confirmation ? (
            <Chip tone="rose" className="mb-2">
              <IconUser className="h-3.5 w-3.5" />
              reviewer confirmation required
            </Chip>
          ) : null}
          <p className="text-base font-semibold leading-snug text-ink">{diagnosis.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">{diagnosis.explanation}</p>

          <div className="mt-3 rounded-card bg-ink px-4 py-3 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/70">
              <IconArrowRight className="h-4 w-4" />
              Next action
            </div>
            <p className="mt-1 text-base font-semibold leading-relaxed">{result.next_action.text}</p>
            <p className="mt-2 border-t border-white/20 pt-2 text-xs text-white/75">
              Owner: {result.next_action.owner} · {result.next_action.note}
            </p>
          </div>

          <p className="mt-3 font-mono text-xs leading-relaxed text-ink/55">
            {result.workflow.nodes.join(" → ")} · terminal state {result.workflow.terminal_state} · 0 runtime LLM calls
          </p>
        </>
      )}
    </Panel>
  );
}

function Stepper({
  label,
  value,
  onChange,
  tone = "sky",
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  tone?: "sky" | "rose";
}) {
  return (
    <div className="rounded-card border border-ink/10 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-ink/60">{label}</div>
      <div className="mt-1.5 flex items-center gap-3">
        <Btn
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          title={`Decrease ${label}`}
          className="!px-3.5"
        >
          −
        </Btn>
        <span className={`tabular text-3xl font-semibold leading-none ${tone === "rose" ? "text-danger" : "text-blue"}`}>
          {value}
        </span>
        <Btn onClick={() => onChange(value + 1)} title={`Increase ${label}`} className="!px-3.5">
          +
        </Btn>
      </div>
    </div>
  );
}

function EvidenceNode({
  icon,
  id,
  label,
  note,
  linked,
}: {
  icon: React.ReactNode;
  id: string;
  label: string;
  note: string;
  linked: boolean;
}) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={`absolute -left-[31px] mt-1 flex h-5 w-5 items-center justify-center rounded-full border ${
          linked ? "border-success/40 bg-tint-success text-success" : "border-ink/20 bg-white text-ink/45"
        }`}
      >
        <span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span>
      </span>
      <div
        className={`rounded-card border px-4 py-2.5 ${
          linked ? "border-ink/10 bg-white" : "border-dashed border-ink/15 bg-canvas/50"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs font-medium text-ink">{id}</span>
          <Chip tone={linked ? "linked" : "slate"}>
            {linked ? <IconCheck className="h-3.5 w-3.5" /> : <IconInfo className="h-3.5 w-3.5" />}
            {linked ? "linked" : "pending"}
          </Chip>
        </div>
        <div className="mt-0.5 text-sm text-ink">{label}</div>
        <div className="text-xs text-ink/60">{note}</div>
      </div>
    </li>
  );
}
