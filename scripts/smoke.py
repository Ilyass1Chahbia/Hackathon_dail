#!/usr/bin/env python
"""End-to-end smoke test of the running demo (Next.js rewrite -> FastAPI/LangGraph).

Run with both services up:
    ./scripts/dev.sh            # terminal 1
    uv run --project backend python scripts/smoke.py   # terminal 2
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request

WEB = os.environ.get("SMOKE_WEB", "http://127.0.0.1:3000")
API = f"{WEB}/api/py"  # same path the browser uses; on Vercel it is api/index.py

failures: list[str] = []


def call(url: str, payload: dict | None = None, method: str = "GET") -> tuple[int, dict]:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"content-type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read()
            try:
                return response.status, json.loads(body or b"{}")
            except json.JSONDecodeError:
                return response.status, {"_non_json": True}
    except urllib.error.HTTPError as error:
        body = error.read()
        try:
            return error.code, json.loads(body or b"{}")
        except json.JSONDecodeError:
            return error.code, {"_non_json": True}


def check(label: str, actual, expected) -> None:
    ok = actual == expected
    print(f"{'PASS' if ok else 'FAIL'}  {label}: {actual!r}" + ("" if ok else f" (expected {expected!r})"))
    if not ok:
        failures.append(label)


def main() -> int:
    status, health = call(f"{API}/health")
    check("api health", (status, health.get("runtime_llm_calls")), (200, 0))

    status, _ = call(WEB)
    check("web page", status, 200)

    obs1 = {
        "id": "OBS-1",
        "kind": "delivery",
        "received": 8,
        "damaged": 1,
        "source_record": "RC-1",
        "delivery_note": "DN-1",
    }

    # 1 — fast receipt capture
    status, capture = call(
        f"{API}/reconcile",
        {"delivery_note_ids": ["DN-1"], "receipt_ids": ["RC-1"], "observations": [obs1]},
        "POST",
    )
    q = capture["quantities"]
    check("step 1 capture quantities", (status, q["received"], q["damaged"], q["accepted"]), (200, 8, 1, 7))

    # 2 — evidence review
    status, review = call(
        f"{API}/reconcile",
        {
            "order_ids": ["PO-1"],
            "delivery_note_ids": ["DN-1"],
            "receipt_ids": ["RC-1"],
            "invoice_ids": ["INV-1"],
            "observations": [obs1],
        },
        "POST",
    )
    q = review["quantities"]
    check(
        "step 2 evidence review quantities",
        (q["received"], q["damaged"], q["accepted"], q["possible_shortage"]),
        (8, 1, 7, 2),
    )
    check("step 2 diagnosis", review["diagnosis"]["code"], "POSSIBLE_SHORTAGE")
    check("step 2 conclusion count", len(review["conclusions"]) >= 5, True)
    check("step 2 sources present", all(c["source"] for c in review["conclusions"]), True)

    # 3 — changed information
    status, rc2 = call(f"{API}/records/receipt/RC-2")
    check("step 3 RC-2 revealed", (status, rc2.get("received"), rc2.get("accepted")), (200, 2, 2))
    obs2 = {
        "id": "OBS-2",
        "kind": "delivery",
        "received": 2,
        "damaged": 0,
        "source_record": "RC-2",
        "delivery_note": "DN-2",
    }
    status, changed = call(
        f"{API}/reconcile",
        {
            "order_ids": ["PO-1"],
            "delivery_note_ids": ["DN-1", "DN-2"],
            "receipt_ids": ["RC-1", "RC-2"],
            "invoice_ids": ["INV-1"],
            "observations": [obs1, obs2],
        },
        "POST",
    )
    q = changed["quantities"]
    check(
        "step 3 recalculated quantities",
        (q["received"], q["damaged"], q["accepted"], q["possible_shortage"]),
        (10, 1, 9, 0),
    )
    check("step 3 diagnosis updated", changed["diagnosis"]["code"], "DAMAGE_ONLY")
    check("step 3 next action changed", changed["next_action"]["text"] != review["next_action"]["text"], True)

    # 5 — uncertain state
    scan = {
        "id": "OBS-SCAN-1",
        "kind": "repeated_scan",
        "received": 1,
        "damaged": 0,
        "package_identity": None,
    }
    status, uncertain = call(
        f"{API}/reconcile",
        {
            "order_ids": ["PO-1"],
            "delivery_note_ids": ["DN-1"],
            "receipt_ids": ["RC-1"],
            "invoice_ids": ["INV-1"],
            "observations": [obs1, scan],
        },
        "POST",
    )
    check("step 5 received unchanged by repeated scan", uncertain["quantities"]["received"], 8)
    check("step 5 insufficient evidence", uncertain["diagnosis"]["status"], "insufficient_evidence")

    # 4 — reviewer decision + persistence
    status, ack = call(
        f"{WEB}/api/decisions",
        {
            "decision": "corrected",
            "explanation": changed["diagnosis"]["explanation"],
            "correction": "Smoke test: shortage was a staged delivery, not a missing consignment.",
            "engine_version": changed["workflow"]["engine_version"],
            "snapshot": {"diagnosis_code": changed["diagnosis"]["code"]},
        },
        "POST",
    )
    check("step 4 decision accepted", status, 200)
    print(f"      persistence mode: {ack['persistence']['mode']} — {ack['persistence']['label']}")

    status, event = call(f"{WEB}/api/events", {"kind": "smoke_event", "payload": {"ok": True}}, "POST")
    check("simulated event recorded", status, 200)

    status, history = call(f"{WEB}/api/history")
    check("history has decision", history["persistence"]["mode"] == ack["persistence"]["mode"], True)

    # 6 — reset
    status, reset = call(f"{WEB}/api/reset", {}, "POST")
    check("step 6 reset", (status, reset.get("reset")), (200, True))

    print()
    if failures:
        print(f"{len(failures)} check(s) failed: {', '.join(failures)}")
        return 1
    print("All smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
