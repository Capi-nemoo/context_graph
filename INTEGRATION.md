# Integration into SCSP-Hackathon-2026

Three changes. Total ~30 minutes including `supabase db push` and a redeploy.

> **Status:** these changes have **already been merged into
> `SCSP-Hackathon-2026/main`**. This doc is the recipe for understanding the
> wiring or for applying it manually on top of any future fork that doesn't
> already have it.

## Prerequisites

- Same Supabase project as the main app (no separate project needed).
- These env vars on Vercel + locally:
  - `OPENAI_API_KEY` — drives both the 9-agent pipeline (Responses API) and
    the context graph (extraction + embeddings)
  - `SUPABASE_SERVICE_ROLE_KEY` (already required)

## 1 · Apply the migration

Copy `migrations/0002_context_graph.sql` from this repo into the main repo:

```bash
cp ../context_graph/migrations/0002_context_graph.sql supabase/migrations/
supabase db push
```

This adds `context_nodes`, `context_edges`, the `vector` extension, three RPCs
(`upsert_context_node`, `match_context_nodes`, `match_context_nodes_for`), and
RLS policies (owner-only, same pattern as the rest of the schema).

## 2 · Copy the library + panel

The library is plain TS and the panel is plain React — both consume only
`@supabase/supabase-js`, `openai`, and `reactflow`. The main app already has
the first two; the rest is a one-liner add.

```bash
# from the main repo root
cp -r ../context_graph/src/lib/graph        frontend/src/lib/
cp -r ../context_graph/src/components/graph frontend/src/components/
```

Add deps to `frontend/package.json`:

```json
"openai": "^6.34.0",
"d3-force": "^3.0.0"
```

…and devDeps:

```json
"@types/d3-force": "^3.0.10"
```

Then `cd frontend && npm install`.

Update `frontend/.env.local.example`:

```
OPENAI_API_KEY=
```

## 3 · Hook the pipeline

Two tiny edits to `frontend/src/lib/ai/pipeline.ts` — a fire-and-forget
extraction after each agent, and a context lookup before each agent.

```diff
 import "server-only";
 import { AGENTS, AGENT_BY_ID } from "@/lib/agents";
 import { callAgent } from "./openai";
 import { AGENT_PROMPTS } from "./prompts";
 import { summarizeDatasets } from "./hypgen";
 import type { createAdminClient } from "@/lib/supabase/admin";
 import type { AgentId, AgentStatus, JobOutputs } from "@/lib/types";
+import {
+  extractAndStore,
+  findRelevantContext,
+  buildContextBlock,
+} from "@/lib/graph";
```

In the per-agent loop, replace the existing `callAgent({ ... })` with:

```diff
-      const text = await callAgent({
-        system: cfg.system,
-        user: cfg.user({ ...ctxBase, priorOutputs: outputs }),
-        useWebSearch: cfg.useWebSearch,
-        model: cfg.model,
-        reasoningEffort: cfg.reasoningEffort,
-        maxOutputTokens: cfg.maxTokens,
-      });
+      // 1. Look up relevant prior knowledge from the user's graph.
+      const relevant = await findRelevantContext(admin, hypothesisTitle, {
+        ownerId,
+        k: 6,
+      }).catch(() => []);
+      const contextBlock = buildContextBlock({ relevant });
+
+      const text = await callAgent({
+        system: cfg.system,
+        user:
+          cfg.user({ ...ctxBase, priorOutputs: outputs }) + contextBlock,
+        useWebSearch: cfg.useWebSearch,
+        model: cfg.model,
+        reasoningEffort: cfg.reasoningEffort,
+        maxOutputTokens: cfg.maxTokens,
+      });
+
+      // 2. Extract entities from the new output. Fire-and-forget — failures
+      //    must not break the pipeline.
+      void extractAndStore(admin, text, {
+        ownerId,
+        sourceResearchId: job.research_id,
+        sourceJobId: jobId,
+        sourceAgent: id,
+        hypothesisTitle,
+      });
```

> The `ownerId` value comes from the research row, not the job row. Add
> `owner_id` to the research select at the top of `runPipeline`:
>
> ```diff
> -    .select("problem_statement")
> +    .select("problem_statement, owner_id")
> ```
>
> Then capture it as `const ownerId = research.owner_id as string;`. The
> `findRelevantContext` and `extractAndStore` calls above both reference it.

## 4 · Embed the panel in `/research/[id]`

Open `frontend/src/app/research/[id]/page.tsx` and add a section above
`JOBS`:

```tsx
import { ContextGraphPanel } from "@/components/graph/context-graph-panel";

// …

<section className="mb-8">
  <h2 className="mb-3 text-sm font-bold tracking-widest" style={{ color: "#a0a09a" }}>
    CONTEXT GRAPH
  </h2>
  <ContextGraphPanel
    researchId={research.id}
    defaultScope="this"
    height={520}
  />
</section>
```

Done. The panel hits Realtime; new nodes pop in as the pipeline writes them.

## Sanity-check the wiring

```bash
cd frontend
npm run typecheck          # if you have one — otherwise:
npx tsc --noEmit
npm run dev
```

Open `/research/<some-id>`, approve a job, and watch the graph fill in next to
the AgentGraph as each agent completes.

## Rollback

```bash
# revert the file copies
git checkout HEAD -- frontend/src/lib/graph frontend/src/components/graph \
                     frontend/src/lib/ai/pipeline.ts \
                     frontend/src/app/research/\[id\]/page.tsx \
                     frontend/package.json frontend/package-lock.json

# revert the migration (db down isn't great; just drop the tables)
supabase db query "drop table if exists public.context_edges, public.context_nodes;
                   drop function if exists public.upsert_context_node,
                                          public.match_context_nodes,
                                          public.match_context_nodes_for,
                                          public.get_node_neighborhood;
                   drop extension if exists vector;"
```
