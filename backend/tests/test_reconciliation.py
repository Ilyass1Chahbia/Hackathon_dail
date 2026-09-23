"""Deterministic tests for the C04 reconciliation workflow.

These tests are the evidence that the workflow is deterministic and that the supplied
records are never modified. Run with:  uv run pytest
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from app.engine import EvidenceContext, Observation
from app.graph import run
from app.records import cached_records, load_records, source_dir

SOURCE = source_dir() / "initial.json"


def fingerprint() -> str:
    return hashlib.sha256(SOURCE.read_bytes()).hexdigest()


def rc1() -> Observation:
    return Observation(
        id="OBS-1",
        kind="delivery",
        received=8,
        damaged=1,
        source_record="RC-1",
        delivery_note="DN-1",
    )


def rc2() -> Observation:
    return Observation(
        id="OBS-2",
        kind="delivery",
        received=2,
        damaged=0,
        source_record="RC-2",
        delivery_note="DN-2",
    )


# --- 1. fast receipt capture -------------------------------------------------


def test_step1_capture_derives_seven_accepted():
    result = run(
        EvidenceContext(
            order_ids=("PO-1",),
            delivery_note_ids=("DN-1",),
            receipt_ids=("RC-1",),
            observations=(rc1(),),
        )
    )
    q = result["quantities"]
    assert (q["received"], q["damaged"], q["accepted"]) == (8, 1, 7)


def test_accepted_is_always_received_minus_damaged():
    result = run(EvidenceContext(observations=(rc1(), rc2(),)))
    q = result["quantities"]
    assert q["accepted"] == q["received"] - q["damaged"] == 9


# --- 2. evidence review ------------------------------------------------------


def test_step2_evidence_review_reports_possible_shortage_of_two():
    result = run(
        EvidenceContext(
            order_ids=("PO-1",),
            delivery_note_ids=("DN-1",),
            receipt_ids=("RC-1",),
            invoice_ids=("INV-1",),
            observations=(rc1(),),
        )
    )
    q = result["quantities"]
    assert (q["received"], q["damaged"], q["accepted"]) == (8, 1, 7)
    assert q["invoiced"] == 10
    assert q["possible_shortage"] == 2
    assert result["diagnosis"]["code"] == "POSSIBLE_SHORTAGE"
    assert result["workflow"]["terminal_state"] == "requires_action"


def test_every_conclusion_carries_source_and_calculation():
    result = run(
        EvidenceContext(
            order_ids=("PO-1",),
            delivery_note_ids=("DN-1",),
            receipt_ids=("RC-1",),
            invoice_ids=("INV-1",),
            observations=(rc1(),),
        )
    )
    conclusions = {c["id"]: c for c in result["conclusions"]}
    assert conclusions["CON-ACCEPTED"]["calculation"] == "received(8) - damaged(1) = 7"
    assert conclusions["CON-SHORTAGE"]["calculation"] == "invoiced(10) - received(8) = 2"
    assert "INV-1" in conclusions["CON-SHORTAGE"]["source"]
    assert conclusions["CON-LISTED"]["calculation"] == "DN-1.listed_quantity(8)"
    for conclusion in result["conclusions"]:
        assert conclusion["source"], f"{conclusion['id']} has no source"
        assert conclusion["calculation"]


# --- 3. changed information (RC-2) -------------------------------------------


def test_step3_later_delivery_updates_quantities_and_next_action():
    initial = run(
        EvidenceContext(
            order_ids=("PO-1",),
            delivery_note_ids=("DN-1",),
            receipt_ids=("RC-1",),
            invoice_ids=("INV-1",),
            observations=(rc1(),),
        )
    )
    updated = run(
        EvidenceContext(
            order_ids=("PO-1",),
            delivery_note_ids=("DN-1", "DN-2"),
            receipt_ids=("RC-1", "RC-2"),
            invoice_ids=("INV-1",),
            observations=(rc1(), rc2()),
        )
    )
    q = updated["quantities"]
    assert (q["received"], q["damaged"], q["accepted"]) == (10, 1, 9)
    assert q["possible_shortage"] == 0
    assert updated["diagnosis"]["code"] == "DAMAGE_ONLY"
    assert updated["next_action"]["text"] != initial["next_action"]["text"]
    assert "damaged unit(s) for supplier review" in updated["next_action"]["text"]


# --- 5. uncertain state ------------------------------------------------------


def test_repeated_scan_without_identity_does_not_increase_received():
    repeated = Observation(
        id="OBS-SCAN-1",
        kind="repeated_scan",
        received=1,
        damaged=0,
        package_identity=None,
        label="Simulated repeated scan (no unique package identity)",
    )
    result = run(
        EvidenceContext(
            order_ids=("PO-1",),
            delivery_note_ids=("DN-1",),
            receipt_ids=("RC-1",),
            invoice_ids=("INV-1",),
            observations=(rc1(), repeated),
        )
    )
    q = result["quantities"]
    assert q["received"] == 8, "a repeated scan must not increase the received quantity"
    assert q["accepted"] == 7
    assert q["unidentified_scans"] == 1
    assert result["diagnosis"]["status"] == "insufficient_evidence"
    assert result["diagnosis"]["evidence_insufficient"] is True
    assert result["workflow"]["terminal_state"] == "insufficient_evidence"


# --- determinism and record integrity ----------------------------------------


def test_identical_input_is_byte_identical_output():
    ctx = EvidenceContext(
        order_ids=("PO-1",),
        delivery_note_ids=("DN-1", "DN-2"),
        receipt_ids=("RC-1", "RC-2"),
        invoice_ids=("INV-1",),
        observations=(rc1(), rc2()),
    )
    assert json.dumps(run(ctx), sort_keys=True) == json.dumps(run(ctx), sort_keys=True)


def test_engine_never_writes_to_the_supplied_records():
    before = fingerprint()
    run(
        EvidenceContext(
            order_ids=("PO-1",),
            delivery_note_ids=("DN-1",),
            receipt_ids=("RC-1",),
            invoice_ids=("INV-1",),
            observations=(rc1(),),
        )
    )
    assert fingerprint() == before == cached_records().sha256


def test_no_llm_dependency_is_configured():
    import app.graph as graph_module

    source_text = Path(graph_module.__file__).read_text(encoding="utf-8")
    for forbidden in ("openai", "anthropic", "ChatOpenAI", "api_key"):
        assert forbidden.lower() not in source_text.lower()


def test_supplied_records_parse_and_rules_preserved():
    records = load_records()
    assert records.case_id == "C04"
    assert records.data_status.startswith("SYNTHETIC EXERCISE DATA")
    assert "One scan is not necessarily one new delivery." in records.rules
    assert len(records.receipts) == 2


@pytest.mark.parametrize(
    "reason",
    ["POSIX source path resolvable"],
)
def test_source_directory_is_the_only_record_location(reason):
    assert source_dir().name == "source"
    assert (source_dir() / "initial.json").is_file()
