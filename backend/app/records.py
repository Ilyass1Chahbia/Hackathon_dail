"""Supplied-record loading for case C04.

The supplied files in ``source/`` are read-only. Nothing in this service writes to
them; the records are loaded once and treated as immutable (``frozen`` dataclasses).
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

CASE_ID = "C04"


def source_dir() -> Path:
    """Locate ``source/`` without duplicating the supplied records."""
    env = os.environ.get("OCTOPUS_SOURCE_DIR")
    if env:
        return Path(env).resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "source" / "initial.json"
        if candidate.is_file():
            return candidate.parent
    raise FileNotFoundError("could not locate source/initial.json")


@dataclass(frozen=True)
class Order:
    id: str
    part: str
    quantity: int


@dataclass(frozen=True)
class DeliveryNote:
    id: str
    order_id: str
    part: str
    listed_quantity: int


@dataclass(frozen=True)
class Receipt:
    id: str
    delivery_note: str
    received: int
    damaged: int
    accepted: int


@dataclass(frozen=True)
class Invoice:
    id: str
    delivery_notes: tuple[str, ...]
    part: str
    quantity: int


@dataclass(frozen=True)
class Records:
    case_id: str
    data_status: str
    clock: str
    orders: tuple[Order, ...]
    delivery_notes: tuple[DeliveryNote, ...]
    receipts: tuple[Receipt, ...]
    invoices: tuple[Invoice, ...]
    rules: tuple[str, ...]
    sha256: str

    def order(self, order_id: str) -> Order | None:
        return next((o for o in self.orders if o.id == order_id), None)

    def delivery_note(self, dn_id: str) -> DeliveryNote | None:
        return next((d for d in self.delivery_notes if d.id == dn_id), None)

    def receipt(self, rc_id: str) -> Receipt | None:
        return next((r for r in self.receipts if r.id == rc_id), None)

    def invoice(self, inv_id: str) -> Invoice | None:
        return next((i for i in self.invoices if i.id == inv_id), None)


def load_records(path: Path | None = None) -> Records:
    path = path or (source_dir() / "initial.json")
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Records(
        case_id=raw["case_id"],
        data_status=raw["data_status"],
        clock=raw["clock"],
        orders=tuple(Order(**o) for o in raw["orders"]),
        delivery_notes=tuple(DeliveryNote(**d) for d in raw["delivery_notes"]),
        receipts=tuple(Receipt(**r) for r in raw["receipts"]),
        invoices=tuple(
            Invoice(
                id=i["id"],
                delivery_notes=tuple(i["delivery_notes"]),
                part=i["part"],
                quantity=i["quantity"],
            )
            for i in raw["invoices"]
        ),
        rules=tuple(raw["rules"]),
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
    )


@lru_cache(maxsize=1)
def cached_records() -> Records:
    return load_records()


def reveal(record_kind: str, record_id: str) -> dict:
    """Reveal one supplied record without modifying ``source/initial.json``.

    Used only for the clearly-labelled RC-2 simulation.
    """
    records = cached_records()
    if record_kind == "receipt":
        rc = records.receipt(record_id)
        if rc is None:
            raise KeyError(record_id)
        return {
            "id": rc.id,
            "delivery_note": rc.delivery_note,
            "received": rc.received,
            "damaged": rc.damaged,
            "accepted": rc.accepted,
        }
    if record_kind == "delivery_note":
        dn = records.delivery_note(record_id)
        if dn is None:
            raise KeyError(record_id)
        return {
            "id": dn.id,
            "order_id": dn.order_id,
            "part": dn.part,
            "listed_quantity": dn.listed_quantity,
        }
    raise KeyError(f"unsupported record kind: {record_kind}")
