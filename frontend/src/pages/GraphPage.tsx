import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import clsx from "clsx";

import { api } from "../lib/api";

const SAMPLE = `vitalik.eth, nick.eth
nick.eth, ens.eth
vitalik.eth, ens.eth
brantly.eth, nick.eth
brantly.eth, ens.eth`;

type Mode = "view" | "connect" | "delete";

type FGNode = NodeObject & {
  id: string;
  label: string;
  avatar: string;
  resolved: boolean;
  address: string;
};

type FGLink = LinkObject & {
  source: string | FGNode;
  target: string | FGNode;
};

type Toast = { id: number; kind: "info" | "error"; message: string };

export default function GraphPage() {
  const navigate = useNavigate();
  const [pairs, setPairs] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [firstPick, setFirstPick] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: FGNode[]; links: FGLink[] } | null>(null);
  const [malformed, setMalformed] = useState<string[]>([]);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(true);

  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const buildMutation = useMutation({
    mutationFn: (raw: string) => api.buildGraph(raw),
    onSuccess: (resp) => {
      const nodes: FGNode[] = resp.nodes.map((n) => ({
        id: n.data.id,
        label: n.data.label,
        avatar: n.data.avatar,
        resolved: n.data.resolved,
        address: n.data.address,
        x: n.position.x,
        y: n.position.y,
      }));
      const links: FGLink[] = resp.edges.map((e) => ({
        source: e.data.source,
        target: e.data.target,
      }));
      setGraphData({ nodes, links });
      setMalformed(resp.malformed);
      setUnresolved(resp.unresolved);
      setShowForm(false);
      preloadAvatars(resp.nodes.map((n) => ({ id: n.data.id, url: n.data.avatar })), imageCache.current);
    },
    onError: (err) => pushToast({ kind: "error", message: `Build failed: ${(err as Error).message}` }),
  });

  const addMutation = useMutation({
    mutationFn: ({ a, b }: { a: string; b: string }) => api.addFriendship(a, b),
  });

  const removeMutation = useMutation({
    mutationFn: ({ a, b }: { a: string; b: string }) => api.removeFriendship(a, b),
  });

  function pushToast(t: Omit<Toast, "id">) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3000);
  }

  function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    buildMutation.mutate(pairs);
  }

  function setModeAndReset(m: Mode) {
    setMode(m);
    setFirstPick(null);
  }

  const onNodeClick = useCallback(
    (node: NodeObject) => {
      const n = node as FGNode;
      if (mode === "view") {
        if (n.resolved) navigate(`/${n.id}`);
        return;
      }
      if (mode === "connect") {
        if (!firstPick) {
          setFirstPick(n.id);
        } else if (firstPick === n.id) {
          setFirstPick(null);
        } else {
          const a = firstPick;
          const b = n.id;
          setFirstPick(null);
          addMutation.mutate(
            { a, b },
            {
              onSuccess: (resp) => {
                const exists = graphData?.links.some((l) => linkMatches(l, a, b));
                if (!exists) {
                  setGraphData((g) => g && {
                    nodes: g.nodes,
                    links: [...g.links, { source: a, target: b }],
                  });
                }
                pushToast({
                  kind: "info",
                  message: resp.created ? "Edge added" : "Edge already existed",
                });
              },
              onError: (err) => pushToast({ kind: "error", message: `Add failed: ${(err as Error).message}` }),
            },
          );
        }
      }
    },
    [mode, firstPick, navigate, addMutation, graphData],
  );

  const onLinkClick = useCallback(
    (link: LinkObject) => {
      if (mode !== "delete") return;
      const a = typeof link.source === "object" ? (link.source as FGNode).id : (link.source as string);
      const b = typeof link.target === "object" ? (link.target as FGNode).id : (link.target as string);
      if (!confirm(`Delete edge between ${a} and ${b}?`)) return;
      removeMutation.mutate(
        { a, b },
        {
          onSuccess: () => {
            setGraphData((g) => g && {
              nodes: g.nodes,
              links: g.links.filter((l) => !linkMatches(l, a, b)),
            });
            pushToast({ kind: "info", message: "Edge removed" });
          },
          onError: (err) => pushToast({ kind: "error", message: `Delete failed: ${(err as Error).message}` }),
        },
      );
    },
    [mode, removeMutation],
  );

  const nodeCanvasObject = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as FGNode;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const r = 14;

      // Avatar disc, or placeholder
      const img = imageCache.current.get(n.id);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = "#27272a";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#71717a";
        ctx.font = `${r}px Inter, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.label[0]?.toUpperCase() ?? "?", x, y);
      }

      // Border (highlight first-pick when in connect mode)
      ctx.strokeStyle =
        firstPick === n.id ? "#3b82f6" : n.resolved ? "#71717a" : "#3f3f46";
      ctx.lineWidth = firstPick === n.id ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      // Label
      const fontSize = Math.max(10, 12 / globalScale);
      ctx.font = `${fontSize}px Inter, system-ui`;
      ctx.fillStyle = "#e4e4e7";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(n.label, x, y + r + 4);
    },
    [firstPick],
  );

  // Recenter after data changes
  useEffect(() => {
    if (graphData && fgRef.current) {
      setTimeout(() => fgRef.current?.zoomToFit(400, 60), 60);
    }
  }, [graphData]);

  const modeHint = {
    view: "Click a node to open its profile.",
    connect: firstPick ? `Click another node to connect with ${firstPick}.` : "Click two nodes to create an edge.",
    delete: "Click an edge to remove it.",
  }[mode];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Social graph</h1>
        <p className="mt-1 text-zinc-400 text-sm max-w-2xl">
          Paste ENS name pairs to visualize their connections. Submitted pairs persist
          as friendships. Use the toolbar to add or remove edges directly.
        </p>
      </header>

      <details
        className="mb-6"
        open={showForm}
        onToggle={(e) => setShowForm((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm text-zinc-400 hover:text-white mb-3 select-none">
          {graphData
            ? `Edit input (${graphData.nodes.length} nodes, ${graphData.links.length} edges)`
            : "Input pairs"}
        </summary>
        <form onSubmit={onSubmitForm} className="space-y-3">
          <textarea
            value={pairs}
            onChange={(e) => setPairs(e.target.value)}
            rows={7}
            placeholder={"vitalik.eth, nick.eth\nnick.eth, ens.eth\n…"}
            spellCheck={false}
            autoCapitalize="off"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-600"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="submit"
              disabled={buildMutation.isPending}
              className="bg-white text-zinc-950 font-medium px-4 py-2 rounded-md hover:bg-zinc-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buildMutation.isPending ? "Resolving…" : "Build graph"}
            </button>
            <button
              type="button"
              onClick={() => setPairs(SAMPLE)}
              className="text-sm text-zinc-400 hover:text-white px-3 py-2"
            >
              Load sample
            </button>
            <span className="text-xs text-zinc-600 ml-2">
              One pair per line. Separators: comma, tab, or space.
            </span>
          </div>
        </form>
      </details>

      {buildMutation.isPending && <BuildingIndicator />}

      {malformed.length > 0 && (
        <div className="mb-4 p-3 rounded-md bg-amber-950/30 border border-amber-900 text-amber-300 text-sm">
          <strong>Skipped {malformed.length} malformed line{malformed.length === 1 ? "" : "s"}:</strong>{" "}
          <code className="font-mono text-xs">{malformed.join(" · ")}</code>
        </div>
      )}
      {unresolved.length > 0 && (
        <div className="mb-4 p-3 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm">
          <strong className="text-zinc-300">
            {unresolved.length} name{unresolved.length === 1 ? "" : "s"} did not resolve:
          </strong>{" "}
          <code className="font-mono text-xs">{unresolved.join(", ")}</code>
          <span className="block mt-1 text-xs text-zinc-600">These appear as faded nodes.</span>
        </div>
      )}

      {graphData && graphData.nodes.length > 0 && (
        <div className="rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-1 text-sm flex-wrap">
            <span className="text-zinc-500 text-xs mr-2">Mode:</span>
            {(["view", "connect", "delete"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setModeAndReset(m)}
                className={clsx(
                  "px-3 py-1 rounded-md text-xs transition-colors",
                  mode === m
                    ? "bg-white text-zinc-950 font-medium"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900",
                )}
              >
                {m === "view" ? "View" : m === "connect" ? "Add edge" : "Delete edge"}
              </button>
            ))}
            <span className="text-xs text-zinc-500 ml-auto">{modeHint}</span>
          </div>
          <div style={{ height: 600 }}>
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={(node, color, ctx) => {
                const n = node as FGNode;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(n.x ?? 0, n.y ?? 0, 16, 0, Math.PI * 2);
                ctx.fill();
              }}
              linkColor={() => "#3f3f46"}
              linkWidth={() => 1.5}
              linkHoverPrecision={6}
              onNodeClick={onNodeClick}
              onLinkClick={onLinkClick}
              cooldownTicks={120}
              backgroundColor="#09090b"
              width={undefined}
              height={undefined}
            />
          </div>
          <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
            <span>
              {graphData.nodes.length} node{graphData.nodes.length === 1 ? "" : "s"} ·{" "}
              {graphData.links.length} edge{graphData.links.length === 1 ? "" : "s"}
            </span>
            <span className="text-zinc-600">Drag nodes · Scroll to zoom</span>
          </div>
        </div>
      )}

      {!graphData && !buildMutation.isPending && (
        <p className="text-zinc-500 text-sm">
          Click <em>Load sample</em> then <em>Build graph</em> to see it in action.
        </p>
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 space-y-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "border rounded-md px-4 py-3 text-sm shadow-lg max-w-sm",
              t.kind === "error"
                ? "bg-red-950 border-red-800 text-red-200"
                : "bg-zinc-900 border-zinc-700 text-zinc-100",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function BuildingIndicator() {
  return (
    <div className="mb-6 flex items-center gap-3 text-sm text-zinc-400">
      <div className="w-4 h-4 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
      Resolving names from Ethereum…
    </div>
  );
}

function linkMatches(link: FGLink, a: string, b: string): boolean {
  const src = typeof link.source === "object" ? (link.source as FGNode).id : (link.source as string);
  const tgt = typeof link.target === "object" ? (link.target as FGNode).id : (link.target as string);
  return (src === a && tgt === b) || (src === b && tgt === a);
}

function preloadAvatars(
  items: { id: string; url: string }[],
  cache: Map<string, HTMLImageElement>,
): void {
  for (const { id, url } of items) {
    if (!url || cache.has(id)) continue;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    cache.set(id, img);
  }
}
