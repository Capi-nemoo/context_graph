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
│   │   ├── extractor.ts            # extractEntities() — OpenAI gpt-5-mini, strict JSON-schema
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
#   OPENAI_API_KEY          — required for both extraction and embeddings
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY — only needed for LIVE mode

npm install
npm run dev
```

Open <http://localhost:3000>. The page boots in **DEMO mode** with mock data —
no Supabase needed. Click `RUN EXTRACTOR` to invoke OpenAI `gpt-5-mini` against
a synthetic agent output and watch new nodes/edges appear. Switch to **LIVE
mode** to render the real graph from your Supabase project.

## Demo against an existing research

The DEMO mode at `/` only shows mock data. To watch the panel against a real
research that's already accumulated nodes from past pipeline runs:

1. Make sure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `OPENAI_API_KEY` filled in.
2. **Easiest path** — open the main app's `/research/<research-id>` page. The
   `CONTEXT GRAPH` section under `AGENT PIPELINE` automatically scopes itself
   to that research's nodes and edges.
3. **Or embed the panel anywhere** with a research ID:
   ```tsx
   import { ContextGraphPanel } from "@/components/graph/context-graph-panel";

   // Scope to one research's subgraph
   <ContextGraphPanel
     researchId="00000000-0000-0000-0000-000000000000"  // ← your research UUID
     defaultScope="this"
     height={520}
   />

   // OR: show the user's full accumulated graph across every research
   <ContextGraphPanel defaultScope="all" />
   ```
4. **Find a research UUID**: visit `/research` in the main app, click any
   research card, copy the UUID from the URL (`/research/<uuid>`).
5. The panel hits Supabase Realtime, so as soon as any pipeline run extracts
   new nodes for that research, they pop in live.

If you want to backfill an older research that ran *before* the context graph
shipped (so it has no nodes yet), re-run the pipeline on the same hypothesis
once and the agents' outputs will populate the graph from scratch.

## Integrate into SCSP-Hackathon-2026

See [INTEGRATION.md](./INTEGRATION.md) — a copy-paste recipe with three
changes (migration, pipeline hooks, embed the panel).

> **Already merged.** The current `SCSP-Hackathon-2026/main` already has all
> three changes applied (migration `0002_context_graph.sql`, the `lib/graph/`
> + `components/graph/` files, and the pipeline hooks in
> `frontend/src/lib/ai/pipeline.ts`). INTEGRATION.md exists as a reference for
> applying these on top of any future fork or for understanding the wiring.

## Stack

- **Database**: Postgres (via Supabase) + pgvector for 1536-dim embeddings,
  IVFFlat index for cosine search
- **Extraction**: OpenAI `gpt-5-mini` via the Responses API with strict JSON
  schema output (`reasoning.effort = "low"`)
- **Embeddings**: OpenAI `text-embedding-3-small` (cheapest viable, $0.00002/node)
- **UI**: Next.js 16 + React 19 + Tailwind 4 + ReactFlow (matches main app exactly)
- **Layout**: `d3-force` precomputed positions — Obsidian-feeling without the
  jitter of live simulation

## Cost

Per pipeline run, on top of the existing pipeline cost:

- Extraction: 8 agents × ~$0.001 (gpt-5-mini at low reasoning) = **~$0.008**
- Embeddings: ~30 nodes × $0.00002 = **~$0.0006**

≈ **+$0.01 per run.** Effectively free.

## License

MIT. Same as the parent project.
