# Prototype handoff

Case: **C04 — The delivery arrived. The invoice tells a different story.** Candidate/team: _solo candidate, Octopus day 1_.
Prototype location: repository root (`web/` Next.js, `api/` FastAPI + LangGraph, `source/` supplied records).

## The problem we validated

Actor, painful moment and consequence: the **dealership parts receiving lead** at the loading bay records what
physically arrived; later, whoever reconciles the invoice cannot tell whether a difference is a shortage, a damaged
item, a duplicate scan or a second delivery. The consequence is unresolved supplier claims, disputed credits and
stock that is wrong for days.

Client evidence: role-play dialogue supplied with the case — "they cannot tell whether a difference was a shortage, a
damaged item, a duplicate scan or a second delivery". The supplied rules confirm the operating constraints: keep
received/damaged/accepted separate, one scan is not one new delivery, no stock or accounting write without review.

What the client changed in our understanding: the starting fact is the **physical arrival**, not the document; the
receiver must be able to capture in seconds and defer interpretation; and a second scan of the same package must never
be treated as a new delivery. The reviewer keeps every decision — the system proposes, it does not post.

What remains an assumption: that a receiving lead will accept an evidence panel as the place to resolve a discrepancy
instead of a mailbox thread, and that the invoice arrives soon enough for the comparison to be useful on the same day.

## Open and demonstrate it

Exact run instructions and start state: `./scripts/dev.sh`, then open <http://localhost:3000>. The start state is the
supplied records only — RC-1 replayed, DN-1 and FILTER-X linked, no invoice linked, no decisions recorded.

Ordinary path: step 1 confirm receipt observation (8 received, 1 damaged, 7 accepted calculated) → step 2 link
PO-1/DN-1/RC-1/INV-1 → 8 / 1 / 7 with a possible shortage of 2, each conclusion carrying its source and calculation.

Changed-information path: step 3 "Simulate later delivery RC-2" → RC-2 is revealed read-only from
`source/initial.json` and the updated evidence is sent to the Python/LangGraph workflow → 10 received / 1 damaged /
9 accepted, shortage 0, diagnosis becomes "quantities match the invoice; 1 damaged unit not accepted" and the next
action changes without a further prompt.

Failure or uncertainty path: step 5 "Simulate repeated scan (no unique package identity)" → received stays at 10, the
workflow returns insufficient evidence and blocks the quantity change until a reviewer confirms the package identity.

## What is real

| Component | Implemented or simulated | Evidence and limitation |
| --- | --- | --- |
| Input and event trigger | Simulated | RC-1/RC-2 are supplied synthetic records replayed through labelled buttons; no scanner or supplier feed. Verified by `scripts/smoke.py` and the "Simulation" chips in the UI. |
| Retrieval / reasoning | Implemented, deterministic | `api/app/engine.py` + `api/app/graph.py` (LangGraph `StateGraph`, conditional edge). `/health` returns `runtime_llm_calls: 0`; 15 pytest cases pin the outputs. |
| Human review | Implemented | `POST /api/decisions` stores approved / corrected / unresolved against the explanation, engine version and quantity snapshot reviewed. |
| External action | Not implemented (by design) | No supplier message, inventory movement or accounting entry exists in the codebase; the UI states it and the API returns `executed_by_prototype: "no"`. |
| Persistence and history | Implemented with fallback | `supabase/schema.sql` (`c04_events`, `c04_decisions`) for a hosted Supabase Free project; without credentials the app runs in memory and displays "Persistence unavailable — local demo mode". |

## Next client validation

One real case we would test: take the next part that arrives in more than one consignment at the dealership and run
steps 1–3 live with the receiving lead while the invoice is still open.

What counts as success: the lead resolves the discrepancy from the evidence panel alone, in under 30 seconds, without
a mailbox search, and the recorded decision matches what the parts manager would have concluded manually.

Who evaluates it: the parts manager (correctness of the resolution) and the receiving lead (speed and fit with the
bay workflow).

## Wolf work

Required integration and permission: read-only access to the **delivery-note and invoice documents** for a single
dealership (receiving + purchase ledger extracts), plus the scanner or handheld that supplies a unique package
identity. Write access is needed only for the two prototype tables (`c04_events`, `c04_decisions`) — no ERP write
scope is requested.

Data boundary and model processing location: all reconciliation is arithmetic performed inside the deployment's own
network. Records stay in the customer tenancy; the hosted Supabase project stores only simulated events and reviewer
decisions, and no model is invoked at run time. If a model is added later it must not receive supplier pricing or
personal data.

Failure/recovery plan: if the workflow service is unreachable the UI blocks automatic recalculation, shows
"Deterministic workflow unavailable" and keeps the reviewer in control — no quantity is silently changed. If Supabase
is unreachable the app degrades to labelled local demo mode; events queue in memory and are lost on restart, which the
banner states.

Monitoring owner: the receiving lead owns day-to-day correctness; the dealership IT contact owns service uptime and
the Supabase project.

Scope and effort drivers: document retrieval/normalisation for real delivery notes and invoices, package identity on
the scan source, and the review rules each dealership applies to damage versus shortage. **No invented price or
delivery commitment.**

Next action and owner: the candidate hands this repository to the event facilitator and to the receiving lead;
owner = receiving lead for the first live case, with a follow-up review after the first three real discrepancies.
