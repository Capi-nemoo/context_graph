// d3-force-driven position layout. Runs a fixed number of ticks once on data
// load, returns {nodeId → {x,y}}. ReactFlow then renders at those positions,
// and the user can drag from there.
//
// Why pre-compute instead of running the simulation live: live force on every
// pipeline tick gets jittery and steals focus from the user. A one-shot
// layout-on-load looks like Obsidian's "open the canvas" moment.

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export type LayoutNode = SimulationNodeDatum & { id: string };
export type LayoutLink = SimulationLinkDatum<LayoutNode> & {
  source: string | LayoutNode;
  target: string | LayoutNode;
};

export type Position = { x: number; y: number };

export function computeLayout(
  nodes: { id: string }[],
  edges: { fromNode: string; toNode: string }[],
  opts: { width?: number; height?: number; ticks?: number } = {},
): Map<string, Position> {
  const width = opts.width ?? 1200;
  const height = opts.height ?? 800;
  const ticks = opts.ticks ?? 200;

  const simNodes: LayoutNode[] = nodes.map((n) => ({ id: n.id }));
  const simLinks: LayoutLink[] = edges.map((e) => ({
    source: e.fromNode,
    target: e.toNode,
  }));

  const sim = forceSimulation(simNodes)
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(simLinks)
        .id((d) => d.id)
        .distance(120)
        .strength(0.4),
    )
    .force("charge", forceManyBody().strength(-260))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide().radius(34))
    .stop();

  for (let i = 0; i < ticks; i++) sim.tick();

  const positions = new Map<string, Position>();
  for (const n of simNodes) {
    positions.set(n.id, { x: n.x ?? width / 2, y: n.y ?? height / 2 });
  }
  return positions;
}
