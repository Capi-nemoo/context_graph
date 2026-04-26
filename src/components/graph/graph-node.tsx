"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { NODE_COLOR, NODE_LABEL } from "@/lib/graph/colors";
import type { GraphNode } from "@/lib/graph/types";

export type GraphNodeData = {
  node: GraphNode;
  highlighted: boolean;
  fresh: boolean; // just appeared via Realtime
};

// Sharp-cornered tile, matches the brutalist aesthetic of the main app.
// Two lines: TYPE label (small, tracked, color-coded) + node label (bold).
// Pulses when `fresh` so live extractions look alive.
export function GraphNodeView({ data, selected }: NodeProps<GraphNodeData>) {
  const { node, highlighted, fresh } = data;
  const color = NODE_COLOR[node.type];
  const isAccented = highlighted || selected;

  return (
    <div
      className="relative flex w-[150px] flex-col gap-0.5 border-2 px-2 py-1.5"
      style={{
        background: isAccented ? "#1a1a1a" : "#141414",
        borderColor: isAccented ? color : "#2a2a2a",
        animation: fresh ? "pulse-bar 1.6s ease-in-out 2" : undefined,
        boxShadow: isAccented ? `0 0 0 1px ${color} inset` : undefined,
        opacity: highlighted === false && data ? 1 : 1,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "transparent",
          border: 0,
          width: 4,
          height: 4,
        }}
      />
      <div
        className="text-[9px] font-bold tracking-[0.15em]"
        style={{ color }}
      >
        {NODE_LABEL[node.type]}
        {node.refCount > 1 ? (
          <span className="ml-1 opacity-60">×{node.refCount}</span>
        ) : null}
      </div>
      <div
        className="overflow-hidden text-[12px] leading-tight font-bold"
        style={{
          color: "#f0f0e8",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={node.label}
      >
        {node.label}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: "transparent",
          border: 0,
          width: 4,
          height: 4,
        }}
      />
    </div>
  );
}
