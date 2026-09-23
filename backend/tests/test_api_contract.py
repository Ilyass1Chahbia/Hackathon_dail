"""Contract tests for the HTTP surface used by the Next.js app."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_zero_llm_calls():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["runtime_llm_calls"] == 0


def test_reveal_rc2_returns_supplied_record():
    body = client.get("/records/receipt/RC-2").json()
    assert body == {"id": "RC-2", "delivery_note": "DN-2", "received": 2, "damaged": 0, "accepted": 2}


def test_reveal_unknown_record_is_404():
    assert client.get("/records/receipt/RC-9").status_code == 404


def test_reconcile_endpoint_initial_then_changed_information():
    initial = client.post(
        "/reconcile",
        json={
            "order_ids": ["PO-1"],
            "delivery_note_ids": ["DN-1"],
            "receipt_ids": ["RC-1"],
            "invoice_ids": ["INV-1"],
            "observations": [
                {"id": "OBS-1", "kind": "delivery", "received": 8, "damaged": 1, "source_record": "RC-1"}
            ],
        },
    ).json()
    assert initial["quantities"]["possible_shortage"] == 2
    assert initial["diagnosis"]["code"] == "POSSIBLE_SHORTAGE"

    updated = client.post(
        "/reconcile",
        json={
            "order_ids": ["PO-1"],
            "delivery_note_ids": ["DN-1", "DN-2"],
            "receipt_ids": ["RC-1", "RC-2"],
            "invoice_ids": ["INV-1"],
            "observations": [
                {"id": "OBS-1", "kind": "delivery", "received": 8, "damaged": 1, "source_record": "RC-1"},
                {"id": "OBS-2", "kind": "delivery", "received": 2, "damaged": 0, "source_record": "RC-2"},
            ],
        },
    ).json()
    assert (updated["quantities"]["received"], updated["quantities"]["accepted"]) == (10, 9)
    assert updated["diagnosis"]["code"] == "DAMAGE_ONLY"
