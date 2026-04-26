"use client";

import { ArrowLeft, ArrowRight, Layers, X } from "lucide-react";
import { NODE_COLOR, NODE_LABEL, relationColor } from "@/lib/graph/colors";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";

type Props = {
  node: GraphNode;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
  onSelect: (nodeId: string) => void;
};

export function NodeDetailPanel({ node, edges, allNodes, onClose, onSelect }: Props) {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const outgoing = edges.filter((e) => e.fromNode === node.id);
  const incoming = edges.filter((e) => e.toNode === node.id);
  const color = NODE_COLOR[node.type];

  return (
    <aside
      className="flex h-full w-[320px] flex-col border-l"
      style={{ background: "#141414", borderColor: "#2a2a2a" }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "#2a2a2a" }}
      >
        <div
          className="text-[10px] font-bold tracking-[0.15em]"
          style={{ color }}
        >
          {NODE_LABEL[node.type]}
        </div>
        <button
          onClick={onClose}
          className="text-[#a0a09a] transition hover:text-[#f0f0e8]"
          aria-label="Close detail panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h3 className="text-[18px] font-extrabold leading-tight" style={{ color: "#f0f0e8" }}>
          {node.label}
        </h3>

        {node.summary && (
          <p
            className="mt-3 text-[12px] leading-relaxed"
            style={{ color: "#a0a09a" }}
          >
            {node.summary}
          </p>
        )}

        <Section title="META">
          <Meta label="seen" value={`${node.refCount}×`} />
          <Meta label="agent" value={node.sourceAgent ?? "—"} />
          <Meta label="last" value={fmtTime(node.lastSeenAt)} />
        </Section>

        {outgoing.length > 0 && (
          <Section title={`OUT · ${outgoing.length}`}>
            <ul className="space-y-1">
              {outgoing.map((e) => {
                const tgt = nodeMap.get(e.toNode);
                if (!tgt) return null;
                return (
                  <EdgeRow
                    key={e.id}
                    direction="out"
                    relation={e.relation}
                    targetLabel={tgt.label}
                    targetType={tgt.type}
                    onClick={() => onSelect(tgt.id)}
                  />
                );
              })}
            </ul>
          </Section>
        )}

        {incoming.length > 0 && (
          <Section title={`IN · ${incoming.length}`}>
            <ul className="space-y-1">
              {incoming.map((e) => {
                const src = nodeMap.get(e.fromNode);
                if (!src) return null;
                return (
                  <EdgeRow
                    key={e.id}
                    direction="in"
                    relation={e.relation}
                    targetLabel={src.label}
                    targetType={src.type}
                    onClick={() => onSelect(src.id)}
                  />
                );
              })}
            </ul>
          </Section>
        )}

        {outgoing.length === 0 && incoming.length === 0 && (
          <Section title="NEIGHBORS">
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "#5a5a55" }}>
              <Layers size={12} />
              isolated · no edges yet
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="mt-5 border-t pt-3"
      style={{ borderColor: "#2a2a2a" }}
    >
      <div
        className="mb-2 text-[10px] font-bold tracking-[0.15em]"
        style={{ color: "#a0a09a" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]" style={{ color: "#a0a09a" }}>
      <span style={{ color: "#5a5a55" }}>{label}</span>
      <span style={{ color: "#f0f0e8" }}>{value}</span>
    </div>
  );
}

function EdgeRow({
  direction,
  relation,
  targetLabel,
  targetType,
  onClick,
}: {
  direction: "in" | "out";
  relation: string;
  targetLabel: string;
  targetType: GraphNode["type"];
  onClick: () => void;
}) {
  const Arrow = direction === "out" ? ArrowRight : ArrowLeft;
  const relColor = relationColor(relation);
  return (
    <li>
      <button
        onClick={onClick}
        className="group flex w-full items-center gap-2 border px-2 py-1.5 text-left transition"
        style={{
          background: "transparent",
          borderColor: "#2a2a2a",
        }}
      >
        <Arrow
          size={11}
          style={{ color: relColor, flexShrink: 0 }}
        />
        <span
          className="text-[9px] font-bold tracking-[0.1em]"
          style={{ color: relColor }}
        >
          {relation.toUpperCase()}
        </span>
        <span className="ml-auto truncate text-[11px]" style={{ color: "#f0f0e8" }}>
          {targetLabel}
        </span>
        <span
          className="text-[9px] font-bold tracking-[0.1em]"
          style={{ color: NODE_COLOR[targetType] }}
        >
          {NODE_LABEL[targetType]}
        </span>
      </button>
    </li>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
