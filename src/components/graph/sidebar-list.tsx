"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { NODE_COLOR, NODE_LABEL } from "@/lib/graph/colors";
import { NODE_TYPES, type GraphNode, type NodeType } from "@/lib/graph/types";

type Props = {
  nodes: GraphNode[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
};

// Left-rail: search box, type filter chips, and a flat list of nodes (most-recently-seen first).
// Click a row to focus it on the canvas + open the detail panel.
export function SidebarList({ nodes, selectedNodeId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(new Set());

  const counts = useMemo(() => {
    const c = new Map<NodeType, number>();
    for (const n of nodes) c.set(n.type, (c.get(n.type) ?? 0) + 1);
    return c;
  }, [nodes]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return nodes
      .filter((n) => activeTypes.size === 0 || activeTypes.has(n.type))
      .filter(
        (n) =>
          !q ||
          n.label.toLowerCase().includes(q) ||
          (n.summary?.toLowerCase().includes(q) ?? false),
      )
      .sort(
        (a, b) =>
          new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
      );
  }, [nodes, query, activeTypes]);

  const toggleType = (t: NodeType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return (
    <aside
      className="flex h-full w-[260px] flex-col border-r"
      style={{ background: "#141414", borderColor: "#2a2a2a" }}
    >
      <div
        className="border-b px-3 py-3"
        style={{ borderColor: "#2a2a2a" }}
      >
        <div className="mb-2 flex items-center gap-2 border px-2 py-1.5" style={{ borderColor: "#2a2a2a" }}>
          <Search size={12} style={{ color: "#5a5a55" }} />
          <input
            type="text"
            placeholder="search nodes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-[11px] outline-none"
            style={{ color: "#f0f0e8" }}
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {NODE_TYPES.filter((t) => counts.has(t)).map((t) => {
            const active = activeTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className="border px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em] transition"
                style={{
                  background: active ? NODE_COLOR[t] : "transparent",
                  color: active ? "#0a0a0a" : NODE_COLOR[t],
                  borderColor: NODE_COLOR[t],
                }}
              >
                {NODE_LABEL[t]} {counts.get(t)}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="flex items-center justify-between px-3 py-2 text-[10px] tracking-[0.15em]"
        style={{ color: "#5a5a55", borderBottom: "1px solid #2a2a2a" }}
      >
        <span>NODES · {filtered.length}</span>
        {activeTypes.size > 0 && (
          <button
            onClick={() => setActiveTypes(new Set())}
            className="text-[9px]"
            style={{ color: "#00e582" }}
          >
            clear
          </button>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-[11px]" style={{ color: "#5a5a55" }}>
            {nodes.length === 0
              ? "graph is empty — run an agent"
              : "no matches"}
          </li>
        ) : (
          filtered.map((n) => {
            const active = n.id === selectedNodeId;
            return (
              <li key={n.id}>
                <button
                  onClick={() => onSelect(n.id)}
                  className="flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left transition"
                  style={{
                    background: active ? "#1a1a1a" : "transparent",
                    borderLeftColor: active ? NODE_COLOR[n.type] : "transparent",
                  }}
                >
                  <span
                    className="mt-1 inline-block h-1.5 w-1.5 shrink-0"
                    style={{ background: NODE_COLOR[n.type] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[11px] font-bold"
                      style={{ color: active ? "#f0f0e8" : "#a0a09a" }}
                    >
                      {n.label}
                    </div>
                    <div
                      className="text-[9px] tracking-[0.1em]"
                      style={{ color: NODE_COLOR[n.type] }}
                    >
                      {NODE_LABEL[n.type]}
                      {n.refCount > 1 && (
                        <span className="ml-1" style={{ color: "#5a5a55" }}>
                          ×{n.refCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
