import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DemoCase } from "./cases";
import type { PersistenceAck, PersistenceInfo } from "./types";

/**
 * Persistence for simulated interaction events and human decisions only.
 * The supplied source records are never written here.
 *
 * Server-only: this module is imported exclusively by route handlers and reads the
 * secret key. Anon, publishable and NEXT_PUBLIC keys are deliberately not accepted,
 * because this client must never end up in a browser bundle.
 *
 * If Supabase is not configured, or the hosted project cannot be reached, the app
 * continues in memory and says so. It never claims remote persistence.
 */

const CASE_ID = "C04";
const EVENTS_TABLE = "c04_events";
const DECISIONS_TABLE = "c04_decisions";
const DEMO_CASES_TABLE = "c04_demo_cases";

export interface PersistedEvent {
  id: number;
  created_at: string;
  case_id: string;
  kind: string;
  payload: Record<string, unknown>;
  simulated: boolean;
}

export interface PersistedDecision {
  id: number;
  created_at: string;
  case_id: string;
  decision: string;
  explanation: string;
  correction: string | null;
  engine_version: string;
  snapshot: Record<string, unknown>;
}

interface MemoryStore {
  events: PersistedEvent[];
  decisions: PersistedDecision[];
  seq: number;
  lastError: string | null;
}

const MEMORY_KEY = Symbol.for("octopus.c04.memory");

function memory(): MemoryStore {
  const holder = globalThis as unknown as Record<symbol, MemoryStore | undefined>;
  if (!holder[MEMORY_KEY]) {
    holder[MEMORY_KEY] = { events: [], decisions: [], seq: 0, lastError: null };
  }
  return holder[MEMORY_KEY]!;
}

const CLIENT_KEY = Symbol.for("octopus.c04.supabase");

function client(): SupabaseClient | null {
  const holder = globalThis as unknown as Record<symbol, SupabaseClient | null | undefined>;
  if (holder[CLIENT_KEY] !== undefined) return holder[CLIENT_KEY] ?? null;

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    holder[CLIENT_KEY] = null;
    return null;
  }
  try {
    holder[CLIENT_KEY] = createClient(url, key, { auth: { persistSession: false } });
  } catch (error) {
    memory().lastError = `Supabase client error: ${String(error)}`;
    holder[CLIENT_KEY] = null;
  }
  return holder[CLIENT_KEY] ?? null;
}

export function persistenceInfo(): PersistenceInfo {
  const configured = client() !== null;
  const error = memory().lastError;
  if (configured && !error) {
    return {
      mode: "supabase",
      label: "Hosted Supabase connected",
      detail:
        "Simulated interaction events and reviewer decisions are persisted to the hosted Supabase project. Supplied records stay in source/initial.json.",
    };
  }
  return {
    mode: "memory",
    label: "Persistence unavailable — local demo mode",
    detail:
      error ??
      "SUPABASE_URL and SUPABASE_SECRET_KEY are not configured. Events and decisions are kept in this server process only and are lost on restart.",
  };
}

function now(): string {
  return new Date().toISOString();
}

export async function recordEvent(
  kind: string,
  payload: Record<string, unknown>,
  simulated = true,
): Promise<PersistenceAck & { event: PersistedEvent }> {
  const row = {
    case_id: CASE_ID,
    kind,
    payload,
    simulated,
  };
  const supabase = client();
  if (supabase) {
    const { data, error } = await supabase.from(EVENTS_TABLE).insert(row).select().single();
    if (!error && data) {
      return { persisted: true, id: data.id, persistence: persistenceInfo(), event: data as PersistedEvent };
    }
    memory().lastError = `Supabase insert failed: ${error?.message ?? "unknown error"}`;
  }
  const store = memory();
  store.seq += 1;
  const event: PersistedEvent = { id: store.seq, created_at: now(), ...row };
  store.events.push(event);
  return { persisted: false, id: event.id, persistence: persistenceInfo(), event };
}

export async function recordDecision(input: {
  decision: string;
  explanation: string;
  correction?: string | null;
  engine_version: string;
  snapshot: Record<string, unknown>;
}): Promise<PersistenceAck & { decision: PersistedDecision }> {
  const row = {
    case_id: CASE_ID,
    decision: input.decision,
    explanation: input.explanation,
    correction: input.correction ?? null,
    engine_version: input.engine_version,
    snapshot: input.snapshot,
  };
  const supabase = client();
  if (supabase) {
    const { data, error } = await supabase.from(DECISIONS_TABLE).insert(row).select().single();
    if (!error && data) {
      return { persisted: true, id: data.id, persistence: persistenceInfo(), decision: data as PersistedDecision };
    }
    memory().lastError = `Supabase insert failed: ${error?.message ?? "unknown error"}`;
  }
  const store = memory();
  store.seq += 1;
  const decision: PersistedDecision = { id: store.seq, created_at: now(), ...row };
  store.decisions.push(decision);
  return { persisted: false, id: decision.id, persistence: persistenceInfo(), decision };
}

export async function listHistory(): Promise<{
  persistence: PersistenceInfo;
  events: PersistedEvent[];
  decisions: PersistedDecision[];
}> {
  const supabase = client();
  if (supabase) {
    const [events, decisions] = await Promise.all([
      supabase.from(EVENTS_TABLE).select("*").eq("case_id", CASE_ID).order("id", { ascending: true }),
      supabase.from(DECISIONS_TABLE).select("*").eq("case_id", CASE_ID).order("id", { ascending: true }),
    ]);
    if (!events.error && !decisions.error) {
      return {
        persistence: persistenceInfo(),
        events: (events.data ?? []) as PersistedEvent[],
        decisions: (decisions.data ?? []) as PersistedDecision[],
      };
    }
    memory().lastError = `Supabase read failed: ${events.error?.message ?? decisions.error?.message ?? "unknown"}`;
  }
  const store = memory();
  return { persistence: persistenceInfo(), events: store.events, decisions: store.decisions };
}

/** Removes only the simulated rows written by this demo. Supplied records are untouched. */
export async function resetPersisted(): Promise<PersistenceInfo> {
  const supabase = client();
  if (supabase) {
    const [events, decisions] = await Promise.all([
      supabase.from(EVENTS_TABLE).delete().eq("case_id", CASE_ID),
      supabase.from(DECISIONS_TABLE).delete().eq("case_id", CASE_ID),
    ]);
    if (events.error || decisions.error) {
      memory().lastError = `Supabase delete failed: ${events.error?.message ?? decisions.error?.message ?? "unknown"}`;
    }
  }
  const store = memory();
  store.events = [];
  store.decisions = [];
  store.seq = 0;
  return persistenceInfo();
}

/**
 * Reads the synthetic demo-case catalogue.
 *
 * This is the mocked "ERP/order lookup": the rows are synthetic, and a failure is
 * reported honestly rather than being papered over with invented rows. Callers fall
 * back to the explicitly labelled local DN-1 case only.
 */
export async function listDemoCases(): Promise<{
  cases: DemoCase[];
  persistence: PersistenceInfo;
  error: string | null;
}> {
  const supabase = client();
  if (!supabase) {
    return { cases: [], persistence: persistenceInfo(), error: persistenceInfo().detail };
  }
  const { data, error } = await supabase
    .from(DEMO_CASES_TABLE)
    .select("case_id, delivery_note, purchase_order, part_number, display_name, fixture, synthetic")
    .order("case_id", { ascending: true });

  if (error) {
    memory().lastError = `Supabase read failed: ${error.message}`;
    return { cases: [], persistence: persistenceInfo(), error: error.message };
  }
  return { cases: (data ?? []) as DemoCase[], persistence: persistenceInfo(), error: null };
}
