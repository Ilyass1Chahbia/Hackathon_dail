export interface SuppliedOrder {
  id: string;
  part: string;
  quantity: number;
}

export interface SuppliedDeliveryNote {
  id: string;
  order_id: string;
  part: string;
  listed_quantity: number;
}

export interface SuppliedReceipt {
  id: string;
  delivery_note: string;
  received: number;
  damaged: number;
  accepted: number;
}

export interface SuppliedInvoice {
  id: string;
  delivery_notes: string[];
  part: string;
  quantity: number;
}

export interface SuppliedRecords {
  case_id: string;
  data_status: string;
  clock: string;
  orders: SuppliedOrder[];
  delivery_notes: SuppliedDeliveryNote[];
  receipts: SuppliedReceipt[];
  invoices: SuppliedInvoice[];
  rules: string[];
  fingerprint: string;
}

export type ObservationKind = "delivery" | "repeated_scan";

export interface Observation {
  id: string;
  kind: ObservationKind;
  received: number;
  damaged: number;
  source_record?: string | null;
  delivery_note?: string | null;
  package_identity?: string | null;
  label?: string;
}

export interface EvidenceLink {
  order_ids: string[];
  delivery_note_ids: string[];
  receipt_ids: string[];
  invoice_ids: string[];
  observations: Observation[];
  /** Present only for synthetic catalogue cases; absent for the supplied FILTER-X case. */
  facts?: {
    case_id: string;
    part_number: string;
    ordered: number;
    invoiced: number | null;
  };
}

export interface Quantities {
  received: number;
  damaged: number;
  accepted: number;
  invoiced: number | null;
  listed: number | null;
  possible_shortage: number | null;
  overage: number;
  unlisted_arrivals: number;
  unidentified_scans: number;
}

export interface Conclusion {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  source: string[];
  calculation: string;
  status: "derived" | "missing";
}

export interface EvidenceItem {
  id: string;
  kind: string;
  label: string;
  detail: string;
  source: string;
}

export type DiagnosisStatus = "open" | "resolved" | "insufficient_evidence";

export interface Diagnosis {
  status: DiagnosisStatus;
  code: string;
  headline: string;
  explanation: string;
  evidence_insufficient: boolean;
  requires_reviewer_confirmation: boolean;
  evidence: string[];
  confidence: string;
}

export interface NextAction {
  text: string;
  owner: string;
  note: string;
}

export interface WorkflowMeta {
  engine_version: string;
  nodes: string[];
  terminal_state: string;
  runtime_llm_calls: number;
}

export interface ReconcileResult {
  workflow: WorkflowMeta;
  quantities: Quantities;
  conclusions: Conclusion[];
  evidence: EvidenceItem[];
  diagnosis: Diagnosis;
  next_action: NextAction;
  record_fingerprint: string;
  data_status: string;
}

export type DecisionKind = "approved" | "corrected" | "unresolved";

export interface PersistenceInfo {
  mode: "supabase" | "memory";
  label: string;
  detail: string;
}

export interface PersistenceAck {
  persisted: boolean;
  persistence: PersistenceInfo;
  id: number | null;
}
