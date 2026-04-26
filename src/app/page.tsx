"use client";

// Standalone showcase page. Two modes:
//  - DEMO (default): renders mock data so you can see the panel without Supabase.
//  - LIVE: connects to the configured Supabase project and shows your real graph.
//
// Toggle with the [ DEMO / LIVE ] button in the header.

import { Activity, Brain, Plus, Terminal, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { ContextGraphPanel } from "@/components/graph/context-graph-panel";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { MOCK_EDGES, MOCK_NODES } from "@/lib/graph/mock-data";

type Mode = "demo" | "live";

export default function Home() {
  const [mode, setMode] = useState<Mode>("demo");
  const [extracting, setExtracting] = useState(false);
  const [feed, setFeed] = useState<string[]>([]);
  const [demoNodes, setDemoNodes] = useState<GraphNode[]>(MOCK_NODES);
  const [demoEdges, setDemoEdges] = useState<GraphEdge[]>(MOCK_EDGES);

  useEffect(() => {
    pushFeed("// graph initialized");
    pushFeed(`// loaded ${demoNodes.length} nodes, ${demoEdges.length} edges`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pushFeed(line: string) {
    setFeed((prev) => [...prev.slice(-5), line]);
  }

  async function runExtraction() {
    if (extracting) return;
    setExtracting(true);
    pushFeed("// agent: redteam → calling extractor (Haiku 4.5)");

    const sample = `Recent retrospective EHR studies suggest that metformin use is associated with reduced incidence of mild cognitive impairment in patients with type 2 diabetes. Mechanistic plausibility comes from AMPK activation and downstream mTOR inhibition, mirroring effects observed with rapamycin in animal models. UK Biobank and All of Us data should be triangulated with Mendelian randomization to control for confounding by indication.`;

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sample, agent: "redteam" }),
      });
      if (!res.ok) {
        pushFeed(`// extractor failed (${res.status}) — falling back to demo`);
        await fakeExtract();
        return;
      }
      const data = (await res.json()) as {
        nodes: { type: GraphNode["type"]; label: string; summary?: string }[];
        edges: { fromLabel: string; toLabel: string; relation: string }[];
      };
      pushFeed(`// extracted ${data.nodes.length} nodes, ${data.edges.length} edges`);
      mergeIntoDemo(data);
    } catch (e) {
      pushFeed(`// extractor error: ${(e as Error).message}`);
      await fakeExtract();
    } finally {
      setExtracting(false);
    }
  }

  async function fakeExtract() {
    // No API? Animate a synthetic extraction so the demo still feels live.
    const synthetic = [
      { type: "claim" as const, label: "metformin slows cognitive decline", summary: "EHR retrospective signal in T2D patients." },
      { type: "metric" as const, label: "MMSE", summary: "Mini-Mental State Exam — cognitive screening." },
      { type: "method" as const, label: "instrumental variables", summary: "Used in MR to address confounding by indication." },
    ];
    for (const n of synthetic) {
      await sleep(450);
      const id = `synthetic-${Math.random().toString(36).slice(2, 8)}`;
      const newNode: GraphNode = {
        id,
        ownerId: "demo",
        type: n.type,
        label: n.label,
        summary: n.summary,
        sourceResearchId: "demo-research-1",
        sourceJobId: "demo-job-2",
        sourceAgent: "redteam",
        refCount: 1,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        metadata: {},
      };
      setDemoNodes((prev) => [...prev, newNode]);
      pushFeed(`// + [${n.type}] ${n.label}`);
    }
    await sleep(450);
    const newEdge: GraphEdge = {
      id: `synthetic-edge-${Math.random().toString(36).slice(2, 8)}`,
      ownerId: "demo",
      fromNode: "n-metformin",
      toNode: demoNodes[demoNodes.length - 1]?.id ?? "n-metformin",
      relation: "supports",
      weight: 1,
      sourceResearchId: "demo-research-1",
      sourceJobId: "demo-job-2",
      sourceAgent: "redteam",
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    setDemoEdges((prev) => [...prev, newEdge]);
    pushFeed("// + edge metformin → supports → ...");
  }

  function mergeIntoDemo(data: {
    nodes: { type: GraphNode["type"]; label: string; summary?: string }[];
    edges: { fromLabel: string; toLabel: string; relation: string }[];
  }) {
    const idByLabel = new Map<string, string>();
    for (const n of demoNodes) idByLabel.set(n.label.toLowerCase(), n.id);
    const newNodes: GraphNode[] = [];
    for (const n of data.nodes) {
      const key = n.label.toLowerCase();
      if (idByLabel.has(key)) continue;
      const id = `live-${Math.random().toString(36).slice(2, 8)}`;
      idByLabel.set(key, id);
      newNodes.push({
        id,
        ownerId: "demo",
        type: n.type,
        label: n.label,
        summary: n.summary ?? null,
        sourceResearchId: "demo-research-1",
        sourceJobId: "demo-job-2",
        sourceAgent: "redteam",
        refCount: 1,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        metadata: {},
      });
    }
    setDemoNodes((prev) => [...prev, ...newNodes]);

    const newEdges: GraphEdge[] = data.edges
      .map((e) => {
        const f = idByLabel.get(e.fromLabel.toLowerCase());
        const t = idByLabel.get(e.toLabel.toLowerCase());
        if (!f || !t || f === t) return null;
        return {
          id: `live-edge-${Math.random().toString(36).slice(2, 8)}`,
          ownerId: "demo",
          fromNode: f,
          toNode: t,
          relation: e.relation,
          weight: 1,
          sourceResearchId: "demo-research-1",
          sourceJobId: "demo-job-2",
          sourceAgent: "redteam",
          metadata: {},
          createdAt: new Date().toISOString(),
        } as GraphEdge;
      })
      .filter((e): e is GraphEdge => e !== null);
    setDemoEdges((prev) => [...prev, ...newEdges]);
  }

  function resetDemo() {
    setDemoNodes(MOCK_NODES);
    setDemoEdges(MOCK_EDGES);
    pushFeed("// graph reset");
  }

  return (
    <main
      className="min-h-screen p-6"
      style={{ background: "#0a0a0a", color: "#f0f0e8" }}
    >
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Terminal size={14} style={{ color: "#00e582" }} />
              <span
                className="text-[11px] font-bold tracking-[0.15em]"
                style={{ color: "#f0f0e8" }}
              >
                CONTEXT_GRAPH
              </span>
              <span
                className="text-[10px]"
                style={{ color: "#5a5a55", letterSpacing: "0.1em" }}
              >
                // v0.1 // autonomous labs
              </span>
            </div>
            <h1 className="text-3xl font-extrabold leading-tight">
              The agent&apos;s memory, made visible.
            </h1>
            <p
              className="mt-2 max-w-[640px] text-[12px] leading-relaxed"
              style={{ color: "#a0a09a" }}
            >
              Every entity and relationship the 9-agent pipeline encounters lands here:
              drugs, diseases, datasets, claims, contradictions. Future runs read from it
              instead of re-discovering. Watch the brain build itself —{" "}
              <span style={{ color: "#00e582" }}>guess → test → learn → repeat.</span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <ModeToggle mode={mode} setMode={setMode} />
            <div className="flex gap-2">
              <button
                onClick={runExtraction}
                disabled={extracting || mode === "live"}
                className="flex items-center gap-1.5 border px-3 py-1.5 text-[10px] font-bold tracking-[0.1em] transition disabled:opacity-50"
                style={{
                  background: extracting ? "#1f1a0a" : "transparent",
                  borderColor: extracting ? "#f0db4f" : "#00e582",
                  color: extracting ? "#f0db4f" : "#00e582",
                }}
                title="Run the extractor against a synthetic agent output"
              >
                {extracting ? <Activity size={11} className="animate-pulse" /> : <Zap size={11} />}
                {extracting ? "EXTRACTING…" : "RUN EXTRACTOR"}
              </button>
              <button
                onClick={resetDemo}
                disabled={extracting || mode === "live"}
                className="flex items-center gap-1.5 border px-3 py-1.5 text-[10px] font-bold tracking-[0.1em] disabled:opacity-50"
                style={{ borderColor: "#2a2a2a", color: "#a0a09a" }}
              >
                <Plus size={11} className="rotate-45" /> RESET
              </button>
            </div>
          </div>
        </header>

        {/* Feed log — narrow strip showing live extractor activity */}
        <div
          className="mb-3 flex items-center gap-3 border px-3 py-1.5 text-[10px]"
          style={{ borderColor: "#2a2a2a", color: "#5a5a55" }}
        >
          <Brain size={11} style={{ color: "#00e582" }} />
          <span className="cursor-block">
            {feed.length > 0 ? feed[feed.length - 1] : "// idle"}
          </span>
        </div>

        {mode === "demo" ? (
          <ContextGraphPanel
            staticData={{ nodes: demoNodes, edges: demoEdges }}
            height={680}
          />
        ) : (
          <ContextGraphPanel defaultScope="all" height={680} />
        )}

        <footer
          className="mt-6 grid gap-3 border-t pt-5 text-[11px] md:grid-cols-3"
          style={{ borderColor: "#2a2a2a", color: "#a0a09a" }}
        >
          <Footnote
            title="WHAT THIS IS"
            body="A persistent, embedding-indexed graph of every entity & claim the pipeline produces. Backed by Postgres + pgvector. Drop-in for SCSP-Hackathon-2026."
          />
          <Footnote
            title="HOW AGENTS USE IT"
            body="Before each agent runs, the orchestrator pulls the top-k semantically relevant nodes (+1-hop edges) and injects them as a 'Prior knowledge' block into the prompt."
          />
          <Footnote
            title="WHY IT MATTERS"
            body="Linear pipelines forget. A graph compounds. Run #21 reads everything you learned from runs #1-20 — without re-paying the search cost or re-discovering contradictions."
          />
        </footer>
      </div>
    </main>
  );
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-0">
      {(["demo", "live"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="border px-2 py-1 text-[9px] font-bold tracking-[0.15em]"
            style={{
              background: active ? "#00e582" : "transparent",
              color: active ? "#0a0a0a" : "#a0a09a",
              borderColor: active ? "#00e582" : "#2a2a2a",
            }}
          >
            {m.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function Footnote({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="border-l-2 pl-3"
      style={{ borderLeftColor: "#00e582" }}
    >
      <div
        className="mb-1 text-[10px] font-bold tracking-[0.15em]"
        style={{ color: "#f0f0e8" }}
      >
        {title}
      </div>
      <div className="leading-relaxed">{body}</div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
