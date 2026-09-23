"""LangGraph wiring for the deterministic C04 reconciliation workflow.

The graph is a real LangGraph ``StateGraph`` with a conditional edge, but every node
is a pure Python function. No model provider is configured and no LLM call is made at
run time — the graph exists to make the workflow, its branches and its terminal states
explicit and testable.
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from .engine import EvidenceContext, compute, diagnose, next_action
from .records import cached_records

NODE_TRACE = ["ingest_evidence", "reconcile_quantities", "diagnose_discrepancy", "route"]


class ReconState(TypedDict, total=False):
    context: EvidenceContext
    computed: dict[str, Any]
    diagnosis: dict[str, Any]
    next_action: dict[str, str]
    outcome: str
    trace: list[str]


def _ingest(state: ReconState) -> ReconState:
    return {"trace": NODE_TRACE[:1]}


def _reconcile(state: ReconState) -> ReconState:
    return {
        "computed": compute(state["context"], cached_records()),
        "trace": state.get("trace", []) + [NODE_TRACE[1]],
    }


def _diagnose(state: ReconState) -> ReconState:
    diagnosis = diagnose(state["computed"], state["context"], cached_records())
    return {
        "diagnosis": diagnosis,
        "next_action": next_action(diagnosis, state["computed"]),
        "trace": state.get("trace", []) + [NODE_TRACE[2]],
    }


def _route(state: ReconState) -> str:
    return state["diagnosis"]["status"]


def _terminal(label: str):
    def node(state: ReconState) -> ReconState:
        return {"outcome": label, "trace": state.get("trace", []) + [NODE_TRACE[3]]}

    return node


def build_graph():
    graph = StateGraph(ReconState)
    graph.add_node("ingest_evidence", _ingest)
    graph.add_node("reconcile_quantities", _reconcile)
    graph.add_node("diagnose_discrepancy", _diagnose)
    graph.add_node("requires_action", _terminal("requires_action"))
    graph.add_node("insufficient_evidence", _terminal("insufficient_evidence"))
    graph.add_node("resolved", _terminal("resolved"))

    graph.add_edge(START, "ingest_evidence")
    graph.add_edge("ingest_evidence", "reconcile_quantities")
    graph.add_edge("reconcile_quantities", "diagnose_discrepancy")
    graph.add_conditional_edges(
        "diagnose_discrepancy",
        _route,
        {
            "open": "requires_action",
            "insufficient_evidence": "insufficient_evidence",
            "resolved": "resolved",
        },
    )
    graph.add_edge("requires_action", END)
    graph.add_edge("insufficient_evidence", END)
    graph.add_edge("resolved", END)
    return graph.compile()


_GRAPH = None


def run(context: EvidenceContext) -> dict[str, Any]:
    """Run the workflow. Deterministic: identical context -> identical payload."""
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    final: ReconState = _GRAPH.invoke({"context": context, "trace": []})
    records = cached_records()
    return {
        "workflow": {
            "engine_version": final["computed"]["engine_version"],
            "nodes": final["trace"],
            "terminal_state": final["outcome"],
            "runtime_llm_calls": 0,
        },
        "quantities": final["computed"]["quantities"],
        "conclusions": final["computed"]["conclusions"],
        "evidence": final["computed"]["evidence"],
        "diagnosis": final["diagnosis"],
        "next_action": final["next_action"],
        "record_fingerprint": records.sha256,
        "data_status": records.data_status,
    }
