import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import ForceGraph3D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-3d";
import * as THREE from "three";
import SpriteText from "three-spritetext";
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

const PLACEHOLDER_DATA_URI = createPlaceholderTexture();

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const textureCache = useRef<Map<string, THREE.Texture>>(new Map());

  // --- Sequential reveal -------------------------------------------------
  // Nodes appear one by one, then edges draw between them. All elements live
  // in the simulation from the start (so positions settle while invisible);
  // we just gate rendering via nodeVisibility / linkVisibility.
  const [revealCount, setRevealCount] = useState(0);

  const revealOrder = useMemo(() => {
    if (!graphData) return { nodes: [] as string[], links: [] as string[] };
    const nodes = graphData.nodes
      .map((n) => n.id)
      .sort((a, b) => a.localeCompare(b));
    const links = graphData.links
      .map((l) => canonicalLinkKey(l))
      .sort((a, b) => a.localeCompare(b));
    return { nodes, links };
  }, [graphData]);

  const totalSteps = revealOrder.nodes.length + revealOrder.links.length;

  useEffect(() => {
    setRevealCount(0);
    if (totalSteps === 0) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      i += 1;
      setRevealCount(i);
      if (i < totalSteps) {
        // Slower for nodes, quicker for the link chase that follows.
        const delay = i < revealOrder.nodes.length ? 220 : 110;
        timer = setTimeout(tick, delay);
      }
    };
    timer = setTimeout(tick, 220);
    return () => { if (timer) clearTimeout(timer); };
  }, [revealOrder, totalSteps]);

  const revealedNodes = useMemo(
    () => new Set(revealOrder.nodes.slice(0, Math.min(revealCount, revealOrder.nodes.length))),
    [revealCount, revealOrder.nodes],
  );
  const revealedLinks = useMemo(() => {
    const linkStep = Math.max(0, revealCount - revealOrder.nodes.length);
    return new Set(revealOrder.links.slice(0, linkStep));
  }, [revealCount, revealOrder]);

  // Track container size so the canvas fills width correctly
  useEffect(() => {
    function updateSize() {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: 600 });
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [graphData]);

  const buildMutation = useMutation({
    mutationFn: (raw: string) => api.buildGraph(raw),
    onSuccess: (resp) => {
      const nodes: FGNode[] = resp.nodes.map((n) => ({
        id: n.data.id,
        label: n.data.label,
        avatar: n.data.avatar,
        resolved: n.data.resolved,
        address: n.data.address,
      }));
      const links: FGLink[] = resp.edges.map((e) => ({
        source: e.data.source,
        target: e.data.target,
      }));
      setGraphData({ nodes, links });
      setMalformed(resp.malformed);
      setUnresolved(resp.unresolved);
      setShowForm(false);
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

  // Custom 3D node: small sphere with avatar texture + sprite label above
  const nodeThreeObject = useCallback(
    (node: NodeObject) => {
      const n = node as FGNode;
      const group = new THREE.Group();

      let texture = n.avatar ? textureCache.current.get(n.avatar) : undefined;
      if (n.avatar && !texture) {
        texture = textureLoader.load(n.avatar);
        textureCache.current.set(n.avatar, texture);
      }
      const sphereMat = new THREE.MeshStandardMaterial({
        map: texture ?? textureLoader.load(PLACEHOLDER_DATA_URI),
        roughness: 0.35,
        metalness: 0.05,
        emissive: new THREE.Color(firstPick === n.id ? 0x3b82f6 : 0x000000),
        emissiveIntensity: firstPick === n.id ? 0.45 : 0,
      });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(3.5, 32, 32), sphereMat);
      group.add(sphere);

      const haloMat = new THREE.MeshBasicMaterial({
        color: firstPick === n.id ? 0x3b82f6 : n.resolved ? 0x71717a : 0x3f3f46,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
      });
      const halo = new THREE.Mesh(new THREE.SphereGeometry(4.4, 24, 24), haloMat);
      group.add(halo);

      const label = new SpriteText(n.label);
      label.color = "#e4e4e7";
      label.backgroundColor = "rgba(9, 9, 11, 0.85)";
      label.padding = 2;
      label.borderRadius = 2;
      label.fontFace = "Inter, system-ui, sans-serif";
      label.fontWeight = "500";
      label.textHeight = 1.8;
      label.position.set(0, 5.5, 0);
      group.add(label);

      return group;
    },
    [firstPick, textureLoader],
  );

  // Cinematic camera intro: pan from far to graph
  useEffect(() => {
    if (!graphData || !fgRef.current) return;
    const fg = fgRef.current;
    // Start far away, then zoom to fit
    fg.cameraPosition({ x: 0, y: 0, z: 600 }, { x: 0, y: 0, z: 0 }, 0);
    const t = setTimeout(() => {
      fg.zoomToFit(1400, 80);
    }, 50);
    return () => clearTimeout(t);
  }, [graphData]);

  const modeHint = {
    view: "Click a node to open its profile. Drag empty space to orbit.",
    connect: firstPick ? `Click another node to connect with ${firstPick}.` : "Click two nodes to create an edge.",
    delete: "Click an edge to remove it.",
  }[mode];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Social graph</h1>
        <p className="mt-1 text-zinc-400 text-sm max-w-2xl">
          Paste ENS name pairs to visualize their connections. Submitted pairs persist
          as friendships. Drag in empty space to orbit, scroll to zoom.
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
          <div ref={containerRef} style={{ height: 600, position: "relative" }}>
            <ForceGraph3D
              ref={fgRef}
              graphData={graphData}
              width={containerSize.width}
              height={containerSize.height}
              backgroundColor="#09090b"
              nodeThreeObject={nodeThreeObject}
              nodeThreeObjectExtend={false}
              nodeVisibility={(n) => revealedNodes.has((n as FGNode).id)}
              linkVisibility={(l) => revealedLinks.has(canonicalLinkKey(l as FGLink))}
              linkColor={() => "#71717a"}
              linkWidth={0.8}
              linkOpacity={0.85}
              onNodeClick={onNodeClick}
              onLinkClick={onLinkClick}
              cooldownTicks={200}
              warmupTicks={40}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              enableNodeDrag={true}
              showNavInfo={false}
            />
          </div>
          <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
            <span>
              {graphData.nodes.length} node{graphData.nodes.length === 1 ? "" : "s"} ·{" "}
              {graphData.links.length} edge{graphData.links.length === 1 ? "" : "s"}
            </span>
            <span className="text-zinc-600">Drag to orbit · Scroll to zoom · Drag a node to reposition</span>
          </div>
        </div>
      )}

      {!graphData && !buildMutation.isPending && (
        <p className="text-zinc-500 text-sm">
          Click <em>Load sample</em> then <em>Build graph</em> to see it in action.
        </p>
      )}

      <div className="fixed bottom-6 right-6 space-y-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "border rounded-md px-4 py-3 text-sm shadow-lg max-w-sm animate-in",
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
  const src = endpointId(link.source);
  const tgt = endpointId(link.target);
  return (src === a && tgt === b) || (src === b && tgt === a);
}

// Order-independent stable id for a link. Works whether source/target are
// raw name strings (before the simulation starts) or full node objects
// (after force-graph swaps them).
function canonicalLinkKey(link: FGLink): string {
  const a = endpointId(link.source);
  const b = endpointId(link.target);
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

function endpointId(ref: string | FGNode): string {
  return typeof ref === "object" ? ref.id : ref;
}

// Tiny grey checkerboard used while real avatars are still loading.
function createPlaceholderTexture(): string {
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <rect width="64" height="64" fill="#27272a"/>
        <circle cx="32" cy="32" r="20" fill="#3f3f46"/>
      </svg>`,
    )
  );
}
