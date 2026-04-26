# context_graph

> The agent's memory, made visible.

Persistent context graph for the **Autonomous Labs** agent pipeline
([SCSP-Hackathon-2026](https://github.com/Capi-nemoo/SCSP-Hackathon-2026)).
Drop-in addon: one migration, one library import, one React panel.

```
guess  →  test  →  learn  →  repeat
                      ↑
                this graph
```

## Why this exists

The 9-agent pipeline in the main project is stateless across runs. Every job
re-discovers the same drugs, papers, and claims from scratch. This package
turns that linear pipeline into a **compounding** one:

- After every agent finishes, an extractor pulls structured entities + relations
  from its output and writes them to a per-user graph (`context_nodes`,
  `context_edges`).
- Before every later agent runs, the orchestrator pulls the top-k semantically
  similar nodes from the graph (+ their 1-hop neighborhood) and injects them as
  a "Prior knowledge" block in the prompt.
- The UI shows the graph forming **live** during a pipeline run, scoped to the
  current research or to the user's full accumulated knowledge.

Run #21 reads everything you learned from runs #1–20.

## What's in here

```
context_graph/
├── migrations/
│   └── 0002_context_graph.sql      # drop into supabase/migrations/ in main repo
├── src/
│   ├── lib/graph/                  # the reusable library
│   │   ├── types.ts                # GraphNode, GraphEdge, NodeType, RelationType
│   │   ├── extractor.ts            # extractEntities() — Claude Haiku 4.5, JSON-schema
│   │   ├── embeddings.ts           # OpenAI text-embedding-3-small (1536-dim)
│   │   ├── queries.ts              # upsertGraph, findRelevantContext, getNeighborhood
│   │   ├── prompt-injection.ts     # buildContextBlock() — prepend to agent prompts
│   │   ├── extract-and-store.ts    # one-shot helper for the pipeline (fire-and-forget)
│   │   ├── client.ts               # browser-safe fetchGraph + subscribeToGraph
│   │   ├── colors.ts               # per-type palette (matches main app's --color-agent-* tokens)
│   │   └── layout.ts               # d3-force position layout
│   ├── components/graph/           # the drop-in React panel
│   │   ├── context-graph-panel.tsx # THE component to embed
│   │   ├── graph-canvas.tsx        # ReactFlow + custom node type
│   │   ├── graph-node.tsx          # brutalist square tile
│   │   ├── node-detail.tsx         # right-side detail panel
│   │   └── sidebar-list.tsx        # left-side searchable node list
│   └── app/
│       ├── page.tsx                # standalone demo page
│       └── api/extract/route.ts    # POST /api/extract — test extraction without Supabase
├── INTEGRATION.md                  # how to wire into SCSP-Hackathon-2026
└── README.md
```

## Run the standalone demo

```bash
cp .env.local.example .env.local
# fill in:
#   ANTHROPIC_API_KEY       — required to actually call the extractor
#   OPENAI_API_KEY          — required to compute embeddings
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY — only needed for LIVE mode

npm install
npm run dev
```

Open <http://localhost:3000>. The page boots in **DEMO mode** with mock data —
no Supabase needed. Click `RUN EXTRACTOR` to invoke Claude Haiku 4.5 against a
synthetic agent output and watch new nodes/edges appear. Switch to **LIVE
mode** to render the real graph from your Supabase project.

## Integrate into SCSP-Hackathon-2026

See [INTEGRATION.md](./INTEGRATION.md) — a copy-paste recipe with three
changes (migration, pipeline hooks, embed the panel).

## Stack

- **Database**: Postgres (via Supabase) + pgvector for 1536-dim embeddings,
  IVFFlat index for cosine search
- **Extraction**: Claude Haiku 4.5 with structured outputs (JSON schema)
- **Embeddings**: OpenAI `text-embedding-3-small` (cheapest viable, $0.00002/node)
- **UI**: Next.js 16 + React 19 + Tailwind 4 + ReactFlow (matches main app exactly)
- **Layout**: `d3-force` precomputed positions — Obsidian-feeling without the
  jitter of live simulation

## Cost

Per pipeline run, on top of the existing $0.30:

- Extraction: 8 agents × ~$0.001 (Haiku) = **~$0.008**
- Embeddings: ~30 nodes × $0.00002 = **~$0.0006**

≈ **+$0.01 per run.** Effectively free.

## License

MIT. Same as the parent project.
