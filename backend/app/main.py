"""FastAPI surface for the C04 deterministic reconciliation workflow."""

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .engine import CaseFacts, EvidenceContext, Observation
from .graph import run
from .records import cached_records, reveal

app = FastAPI(
    title="Octopus C04 reconciliation API",
    version="0.1.0",
    description="Deterministic receipt/invoice reconciliation. No runtime LLM call.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ObservationIn(BaseModel):
    id: str
    kind: Literal["delivery", "repeated_scan"] = "delivery"
    received: int = Field(ge=0)
    damaged: int = Field(ge=0)
    source_record: str | None = None
    delivery_note: str | None = None
    package_identity: str | None = None
    label: str = ""


class CaseFactsIn(BaseModel):
    """Optional snapshot for a synthetic catalogue case (demo cases only)."""

    case_id: str = ""
    part_number: str = ""
    ordered: int | None = None
    invoiced: int | None = None
    listed: int | None = None


class ReconcileRequest(BaseModel):
    order_ids: list[str] = []
    delivery_note_ids: list[str] = []
    receipt_ids: list[str] = []
    invoice_ids: list[str] = []
    observations: list[ObservationIn] = []
    facts: CaseFactsIn | None = None


@app.get("/health")
def health() -> dict:
    records = cached_records()
    return {
        "status": "ok",
        "case_id": records.case_id,
        "record_fingerprint": records.sha256,
        "runtime_llm_calls": 0,
    }


@app.get("/records/{record_kind}/{record_id}")
def get_record(record_kind: str, record_id: str) -> dict:
    """Reveal a supplied record read-only (used by the labelled RC-2 simulation)."""
    try:
        return reveal(record_kind, record_id)
    except KeyError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail=f"unknown record {exc}") from exc


@app.post("/reconcile")
def reconcile(request: ReconcileRequest) -> dict:
    context = EvidenceContext(
        order_ids=tuple(request.order_ids),
        delivery_note_ids=tuple(request.delivery_note_ids),
        receipt_ids=tuple(request.receipt_ids),
        invoice_ids=tuple(request.invoice_ids),
        observations=tuple(
            Observation(
                id=o.id,
                kind=o.kind,
                received=o.received,
                damaged=o.damaged,
                source_record=o.source_record,
                delivery_note=o.delivery_note,
                package_identity=o.package_identity,
                label=o.label,
            )
            for o in request.observations
        ),
        facts=(
            CaseFacts(
                case_id=request.facts.case_id,
                part_number=request.facts.part_number,
                ordered=request.facts.ordered,
                invoiced=request.facts.invoiced,
                listed=request.facts.listed,
            )
            if request.facts is not None
            else None
        ),
    )
    return run(context)
