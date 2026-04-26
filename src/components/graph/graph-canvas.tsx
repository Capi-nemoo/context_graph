"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { GraphNodeView, type GraphNodeData } from "./graph-node";
import { computeLayout } from "@/lib/graph/layout";
import { relationColor } from "@/lib/graph/colors";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";

const nodeTypes = { ctx: GraphNodeView };

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  freshNodeIds: Set<string>;
  onSelect: (nodeId: string | null) => void;
  width?: number;
  height?: number;
};

export function GraphCanvas({
  nodes: graphNodes,
  edges: graphEdges,
  selectedNodeId,
  freshNodeIds,
  onSelect,
  width,
  height,
}: Props) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  // Recompute layout whenever the node set changes meaningfully (count, or any
  // new id appears). Edges alone don't reposition because users hate jumpy
  // graphs.
  const layoutKey = useMemo(
    () => graphNodes.map((n) => n.id).sort().join("|"),
    [graphNodes],
  );

  useEffect(() => {
    if (graphNodes.length === 0) {
      setPositions(new Map());
      return;
    }
    const next = computeLayout(graphNodes, graphEdges, {
      width: width ?? 900,
      height: height ?? 600,
    });
    setPositions(next);
    // We deliberately don't depend on graphEdges — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, width, height]);

  const highlightSet = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const set = new Set<string>([selectedNodeId]);
    for (const e of graphEdges) {
      if (e.fromNode === selectedNodeId) set.add(e.toNode);
      if (e.toNode === selectedNodeId) set.add(e.fromNode);
    }
    return set;
  }, [selectedNodeId, graphEdges]);

  const rfNodes: Node<GraphNodeData>[] = useMemo(() => {
    return graphNodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        type: "ctx",
        position: pos,
        data: {
          node: n,
          highlighted: !selectedNodeId || highlightSet.has(n.id),
          fresh: freshNodeIds.has(n.id),
        },
        draggable: true,
      };
    });
  }, [graphNodes, positions, highlightSet, selectedNodeId, freshNodeIds]);

  const rfEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e) => {
      const isHighlighted =
        !selectedNodeId ||
        e.fromNode === selectedNodeId ||
        e.toNode === selectedNodeId;
      const color = relationColor(e.relation);
      return {
        id: e.id,
        source: e.fromNode,
        target: e.toNode,
        label: e.relation,
        labelStyle: {
          fill: color,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        },
        labelBgStyle: { fill: "#0a0a0a", fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        style: {
          stroke: color,
          strokeWidth: isHighlighted ? 1.4 : 0.7,
          opacity: isHighlighted ? 1 : 0.18,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 12,
          height: 12,
        },
      };
    });
  }, [graphEdges, selectedNodeId]);

  const handleNodeClick = useCallback(
    (_: unknown, node: Node) => onSelect(node.id),
    [onSelect],
  );
  const handlePaneClick = useCallback(() => onSelect(null), [onSelect]);

  return (
    <div
      className="h-full w-full border"
      style={{ background: "#0a0a0a", borderColor: "#2a2a2a" }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable
      >
        <Background color="#1f1f1f" gap={24} size={1} />
        <Controls
          showInteractive={false}
          style={{
            background: "#0a0a0a",
            border: "1px solid #2a2a2a",
          }}
        />
      </ReactFlow>
    </div>
  );
}
