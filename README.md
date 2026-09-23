# Octopus C04 — receipt capture and discrepancy review

**The delivery arrived. The invoice tells a different story.**

Smallest polished local prototype for Octopus case C04. It helps the dealership **parts receiving lead** record
what physically arrived, link the delivery/invoice evidence, and review the difference — without the prototype ever
touching stock, accounts or the supplier.

All records are **synthetic exercise data**. Nothing here is a real client, country, programme or participant, and
this is not an official client service.

---

## Stack

| Layer | Implementation |
| --- | --- |
| UI | Next.js (App Router) + TypeScript + Tailwind |
| Workflow | Python **FastAPI** + **LangGraph** (`StateGraph` with a conditional edge) |
| Reconciliation | Deterministic pure functions — **no runtime LLM call** (`runtime_llm_calls: 0`) |
| Persistence | Hosted **Supabase Free** (events + reviewer decisions only), with a labelled in-memory fallback |
| Source records | `source/initial.json` — read-only, never written by any component |

## Layout

One Vercel project: Next.js at the repository root, the Python workflow as a single serverless function.

```
source/brief.md, source/initial.json   supplied records (unchanged)
docs/scorecard.md, wolf-handoff-template.md  supplied documents (unchanged)
docs/wolf-handoff.md                   completed handoff
docs/client-correction.md              the client correction and what changed
app/, components/, lib/, tests/        Next.js App Router UI and its route handlers (Supabase persistence)
backend/app/                           FastAPI + LangGraph, deterministic engine; backend/tests/ pytest suite
api/index.py                           Vercel Python function: mounts backend/app at /api/py
requirements.txt                       runtime deps for that function (mirror of backend/pyproject.toml)
vercel.json                            trims tests/docs out of the Python bundle
supabase/schema.sql                    tables for simulated events and human decisions
scripts/                               dev, test, smoke, reset
```

The browser calls `/api/py/reconcile` and `/api/py/records/...` directly. On Vercel that path is the Python
function; locally `next.config.mjs` rewrites it to uvicorn on :8000.

## Deploy on Vercel

1. Push the repository to GitHub and import it on Vercel. No root directory, build command or framework override is
   needed: Next.js is detected at the root and `api/index.py` becomes a Python function.
2. Optional environment variables: `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Without them the app runs in the
   labelled in-memory mode.
3. Deploy. `/api/py/health` should answer `{"status":"ok","runtime_llm_calls":0,...}`.

## Run it

Requires Node 20+ and Python 3.11+ with [`uv`](https://docs.astral.sh/uv/).

```bash
./scripts/dev.sh          # starts FastAPI on :8000 and Next.js on :3000
# then open http://localhost:3000
```

Run the pieces separately if you prefer:

```bash
uv sync --project backend && uv run --project backend uvicorn api.index:app --port 8000
npm install && npm run dev
```

Tests and end-to-end verification:

```bash
./scripts/test-api.sh                                  # uv sync + pytest (15 tests)
npm run test:cases                                     # identifier lookup / OCR candidate tests
uv run --project backend python scripts/smoke.py       # against both running services
npm run build                                          # type-check + production build
```

`./scripts/dev.sh` runs the dev server with `NEXT_DIST_DIR=.next-dev`, so running `npm run build` while the demo is
open no longer clobbers the dev server's `.next` output. If you start `npm run dev` by hand, do the same.

Windows note: if this folder is reached through a WSL path (`\\wsl.localhost\...`), run the commands inside the WSL
distribution — Node and `uv` are installed there.

## The demo, step by step

| Step | Action | Result |
| --- | --- | --- |
| 1 | **Confirm receipt observation** (demo replay of supplied RC-1, DN-1 and FILTER-X already linked) | received 8, damage exception 1, **accepted 7 calculated automatically** |
| 2 | **Link evidence and reconcile** (PO-1, DN-1, RC-1, INV-1) | 8 received / 1 damaged / 7 accepted, **possible shortage 2** — every conclusion shows its source and calculation |
| 3 | **Simulate later delivery RC-2** (labelled simulation) | reveals supplied RC-2 read-only, sends the updated evidence to the Python/LangGraph workflow, recalculates to **10 received / 1 damaged / 9 accepted**, shortage 0 — diagnosis and next action update automatically with no further prompt |
| 4 | **Approve explanation / Correct explanation / Leave unresolved** | reviewer decision persisted; no inventory, accounting or supplier action is executed |
| 5 | **Simulate repeated scan (no unique package identity)** | received quantity does **not** increase; workflow reports insufficient evidence and asks the reviewer to confirm the package identity |
| 6 | **Reset demo** | restores the exact initial state and clears only the simulated rows |

## What is real and what is simulated

| Component | Implemented or simulated | Evidence and limitation |
| --- | --- | --- |
| Input / event trigger | Partly implemented | The barcode camera scan is **real** (`@zxing/browser`, 1D + 2D, rear camera where available) but the code-to-delivery lookup behind it is **mocked** against the supplied synthetic records. RC-1 and RC-2 are supplied synthetic records revealed from `source/initial.json`. No EDI or supplier feed is connected. |
| Retrieval / reasoning | Implemented, deterministic | `backend/app/engine.py` computes every quantity and sentence from the linked evidence. `backend/app/graph.py` runs it in a LangGraph `StateGraph`. Zero LLM calls. |
| Human review | Implemented | Approve / correct / unresolved decisions are recorded against the exact explanation and engine version they reviewed. |
| External action | Not implemented | The prototype executes no supplier message, inventory movement or accounting entry. It says so on screen and returns `executed_by_prototype: no`. |
| Persistence | Supabase with labelled local fallback | Only simulated events and reviewer decisions are stored. If Supabase is unreachable the UI shows **"Persistence unavailable — local demo mode"** and never claims remote persistence. |

## Camera scanning (barcode)

**Scan pallet or package** opens a real camera scanner using
[`@zxing/browser`](https://github.com/zxing-js/browser) (`BrowserMultiFormatReader`, 1D and 2D symbologies). The
decoder is imported **dynamically, client-side only** — it is never part of the server bundle.

- The camera is requested with `facingMode: { ideal: "environment" }`, so phones prefer the rear camera.
- Two modes: **Barcode / QR** (continuous decoding) and **Printed reference · OCR beta** (`tesseract.js`, English).
  OCR captures exactly **one frame into an in-memory canvas**, reads it on the device, uppercases the text and proposes
  a `DN-…` / `PO-…` candidate in an **editable confirmation field**. Nothing is opened until the reviewer presses
  **Open delivery**, and the confirmed value goes through the same lookup as a scan or manual entry.
- **No image or video is uploaded or stored.** The canvas is local and discarded; there is no upload call, no blob, no
  persistence of any frame. (The OCR canvas is the only pixel capture, and it never leaves the page.)
- Decoding stops and **every `MediaStream` track is stopped** on the first successful result, on Close, on unmount, on
  page navigation, on a mode change, and on any camera or permission error.
- **The camera needs a secure context — `localhost` or HTTPS.** Over plain HTTP from another host the scanner reports
  that it is unsupported and falls back to manual entry.

Accepted identifiers are the supplied synthetic references **DN-1, PO-1 and FILTER-X**; anything else shows
*"No matching expected delivery found"*. The scanner also carries a labelled **"Simulation — scan DN-1"** fallback,
which passes through **the same lookup handler** a decoded barcode would. Manual entry and the supplied-case shortcut
stay available in every failure state (permission denied, no camera, insecure context, scanning error).

## Demo-case catalogue (synthetic)

`public.c04_demo_cases` holds **three synthetic demo cases** so the entry screen can offer an "Expected deliveries"
list and the mocked ERP/order lookup has something to resolve against. It is **prototype scaffolding, not the
production reconciliation domain model**.

| Case | Delivery note | Purchase order | Part | Expected result |
| --- | --- | --- | --- | --- |
| `C04-FILTER-X` | DN-1 | PO-1 | FILTER-X | possible shortage 2 → after the simulated RC-2, 10/1/9 damage only |
| `C04-AIR-FILTER` | DN-20 | PO-20 | AIR-FILTER-Y | matched |
| `C04-BRAKE-DISC` | DN-30 | PO-30 | BRAKE-DISC-Z | damage exception requiring review |

- **All three cases are synthetic.** The rows carry a `Synthetic` badge in the UI.
- **QR/barcode decoding is real. OCR is real and runs locally — and is beta.**
- **The ERP/order lookup is mocked** through this synthetic catalogue. If Supabase cannot be reached the UI shows the
  honest persistence warning and offers **only** the explicitly labelled local DN-1 fallback; it never invents rows.
- **No inventory, accounting or supplier update is executed**, and **no camera image or video is stored**.
- **Reviewer decisions remain human-controlled.** Only FILTER-X has the simulated later RC-2 event.

RLS is enabled with no policies; the app reads this table from server routes with `SUPABASE_SECRET_KEY` only.

## Persistence (hosted Supabase)

1. Create a Free project, then apply `supabase/schema.sql`. It enables RLS on both tables and deliberately adds no
   policies, so nothing is reachable with a browser key.
2. Copy `.env.example` to `.env.local` (locally) or set the same variables in the Vercel project and set `SUPABASE_URL` and the **secret key** as `SUPABASE_SECRET_KEY`.
3. Restart the web app (or redeploy). The header banner switches to "Hosted Supabase connected".

The persistence client is **server-only** — it is imported exclusively by route handlers and reads the secret key. Anon,
publishable and `NEXT_PUBLIC_*` keys are not accepted, so no Supabase client can leak into a browser bundle. The older
`SUPABASE_SERVICE_ROLE_KEY` name still works as a legacy fallback; prefer `SUPABASE_SECRET_KEY`.

Without credentials the app runs in memory and says so. The supplied records are always read from
`source/initial.json`; they are never copied into or out of Supabase.

## Limitations and disclosures

- Synthetic exercise data only; RC-1/RC-2 replays and every simulation button are labelled in the UI.
- The reconciliation rules are a small deterministic table (`c04-recon-1`) — deliberately not a general engine.
- Damaged units are removed from accepted quantity but no credit note, claim or replacement is created.
- No auth, ERP, OCR or real external integration — the camera is a local input device, not an integration.
- The camera is real; the barcode-to-delivery lookup it feeds is mocked against the supplied synthetic records.
- Repeated-scan detection relies on the absence of a unique package identity; a real deployment needs the scan
  source to supply one.

## Next validation test

Run the prototype for one week at a real loading bay with three parts that arrive in more than one consignment, and
measure whether the receiver can answer "was this a shortage, a damage, a duplicate scan or a second delivery?"
without leaving the screen. Success: the reviewer answers from the evidence panel alone in under 30 seconds, and the
discrepancy is routed correctly on the first attempt. Evaluated by the parts manager and the receiving lead.
