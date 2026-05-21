"""Social graph construction service.

Parses ENS name pairs, batch-resolves them via the step-1 ENS service (with
DB cache), and builds a networkx graph with spring-layout positions ready
for rendering on the client.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import networkx as nx

from .avatar import normalize_avatar
from .ens import ENSNotFound, get_or_resolve, is_valid_ens_name
from .friendships import bulk_add_friendships, friendships_among

logger = logging.getLogger(__name__)

# Parsing
PAIR_SPLIT_RE = re.compile(r"[,\t\s]+")

# Layout tuning
LAYOUT_SEED = 42
LAYOUT_K_FACTOR = 1.2
LAYOUT_SCALE = 400

# Concurrency
NAME_RESOLUTION_WORKERS = 6


@dataclass
class GraphNode:
    id: str
    label: str
    address: str = ""
    avatar_url: str = ""
    resolved: bool = False
    x: float = 0.0
    y: float = 0.0


@dataclass
class GraphEdge:
    source: str
    target: str


@dataclass
class GraphResult:
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    unresolved: list[str]

    def to_dict(self) -> dict:
        """Cytoscape-compatible elements dict. Safe to pass to {{ data|json_script }}."""
        return {
            "nodes": [
                {
                    "data": {
                        "id": n.id,
                        "label": n.label,
                        "address": n.address,
                        "avatar": n.avatar_url,
                        "resolved": n.resolved,
                    },
                    "position": {"x": n.x, "y": n.y},
                }
                for n in self.nodes
            ],
            "edges": [
                {"data": {"source": e.source, "target": e.target, "id": f"{e.source}--{e.target}"}}
                for e in self.edges
            ],
        }


def parse_pairs(raw: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Parse a multi-line pairs input. Returns (pairs, malformed_lines)."""
    pairs: list[tuple[str, str]] = []
    malformed: list[str] = []
    for line in (raw or "").splitlines():
        line = line.strip().lower()
        if not line or line.startswith("#"):
            continue
        # Accept "a, b" / "a b" / "a\tb" / "(a, b)"
        line = line.strip("()[] ")
        parts = [p.strip() for p in PAIR_SPLIT_RE.split(line) if p.strip()]
        if len(parts) == 2 and all(is_valid_ens_name(p) for p in parts):
            pairs.append((parts[0], parts[1]))
        else:
            malformed.append(line)
    return pairs, malformed


def _resolve_one(name: str) -> tuple[str, object]:
    """Wrapper used by the batch executor. Returns (name, Profile or None)."""
    try:
        return name, get_or_resolve(name)
    except ENSNotFound:
        return name, None
    except Exception as exc:  # noqa: BLE001 — log + treat as unresolved so one bad name doesn't fail the batch
        logger.warning("Unexpected resolution error for %s: %s", name, exc)
        return name, None


def build_graph(
    raw_pairs: str,
    persist_pairs: bool = False,
    merge_db_friendships: bool = False,
) -> tuple[GraphResult, list[str]]:
    """Top-level entrypoint. Returns (GraphResult, malformed_lines).

    Args:
        raw_pairs: textarea contents — one "a.eth, b.eth" pair per line.
        persist_pairs: if True, save each typed pair as a Friendship row.
        merge_db_friendships: if True, also add edges from the DB for any
            pair where both endpoints appear in the typed input.
    """
    pairs, malformed = parse_pairs(raw_pairs)
    unique_names = sorted({n for pair in pairs for n in pair})

    if not unique_names:
        return GraphResult(nodes=[], edges=[], unresolved=[]), malformed

    if persist_pairs and pairs:
        bulk_add_friendships(pairs)

    edge_set: set[tuple[str, str]] = {tuple(sorted([a, b])) for a, b in pairs if a != b}
    if merge_db_friendships:
        for a, b in friendships_among(unique_names):
            edge_set.add((a, b))

    workers = min(NAME_RESOLUTION_WORKERS, len(unique_names))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        resolved = dict(ex.map(_resolve_one, unique_names))

    g = nx.Graph()
    for name in unique_names:
        g.add_node(name)
    for a, b in edge_set:
        g.add_edge(a, b)

    # Spring layout (deterministic via seed for stable positions across reloads).
    k = LAYOUT_K_FACTOR / max(1, len(unique_names) ** 0.5)
    positions = nx.spring_layout(g, seed=LAYOUT_SEED, k=k)

    nodes: list[GraphNode] = []
    unresolved: list[str] = []
    for name in unique_names:
        profile = resolved.get(name)
        if profile is None:
            unresolved.append(name)
            records = {}
            address = ""
        else:
            records = profile.records or {}
            address = profile.address or ""
        avatar = normalize_avatar(records.get("avatar"))
        x, y = positions.get(name, (0.0, 0.0))
        nodes.append(GraphNode(
            id=name,
            label=name,
            address=address,
            avatar_url=avatar.url or "",
            resolved=profile is not None,
            x=float(x) * LAYOUT_SCALE,
            y=float(y) * LAYOUT_SCALE,
        ))

    edges = [GraphEdge(source=a, target=b) for a, b in sorted(edge_set)]
    return GraphResult(nodes=nodes, edges=edges, unresolved=unresolved), malformed


SAMPLE_PAIRS = """vitalik.eth, nick.eth
nick.eth, ens.eth
vitalik.eth, ens.eth
brantly.eth, nick.eth
brantly.eth, ens.eth"""
