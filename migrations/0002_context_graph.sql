-- Context graph for Autonomous Labs.
-- Adds two tables (context_nodes, context_edges), pgvector embeddings,
-- and a top-k semantic-search RPC scoped to the caller's owner_id.
--
-- Drop into supabase/migrations/0002_context_graph.sql in the main repo
-- and `supabase db push`.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Nodes — entities extracted from agent outputs.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.context_nodes (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  type            text not null check (type in (
    'drug', 'disease', 'gene', 'protein', 'pathway',
    'dataset', 'study', 'metric', 'method',
    'claim', 'agent_output', 'concept'
  )),
  label           text not null,            -- canonical display label
  label_norm      text generated always as (lower(trim(label))) stored,
  summary         text,                     -- one-sentence definition / context
  -- The research that first surfaced this node. Useful for "show me everything
  -- this research touched" queries; nodes can be referenced by many researches.
  source_research_id uuid references public.research(id) on delete set null,
  source_job_id   uuid references public.jobs(id) on delete set null,
  source_agent    text,                     -- 'miner', 'analysis', ...
  -- 1536-dim embedding of (label + summary). Matches OpenAI text-embedding-3-small.
  embedding       vector(1536),
  metadata        jsonb not null default '{}'::jsonb,
  ref_count       int not null default 1,   -- how many extractions hit this node
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

-- Dedupe key: per-owner, one row per (type, normalized label).
create unique index context_nodes_owner_type_label_uniq
  on public.context_nodes(owner_id, type, label_norm);

create index context_nodes_owner_type   on public.context_nodes(owner_id, type);
create index context_nodes_owner_lastseen on public.context_nodes(owner_id, last_seen_at desc);
create index context_nodes_research      on public.context_nodes(source_research_id);
create index context_nodes_job           on public.context_nodes(source_job_id);

-- IVFFlat for cosine distance. Lists=100 is fine up to ~100k rows; rebuild later.
create index context_nodes_embedding_ivfflat
  on public.context_nodes using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- Edges — directed relations between nodes.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.context_edges (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  from_node       uuid not null references public.context_nodes(id) on delete cascade,
  to_node         uuid not null references public.context_nodes(id) on delete cascade,
  relation        text not null,            -- 'treats', 'inhibits', 'correlates_with',
                                            -- 'cites', 'contradicts', 'derived_from', ...
  weight          numeric not null default 1,
  source_research_id uuid references public.research(id) on delete set null,
  source_job_id   uuid references public.jobs(id) on delete set null,
  source_agent    text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  check (from_node <> to_node)
);

create unique index context_edges_uniq
  on public.context_edges(owner_id, from_node, to_node, relation);

create index context_edges_from   on public.context_edges(owner_id, from_node);
create index context_edges_to     on public.context_edges(owner_id, to_node);
create index context_edges_relation on public.context_edges(owner_id, relation);
create index context_edges_research on public.context_edges(source_research_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.context_nodes enable row level security;
alter table public.context_edges enable row level security;

create policy "context_nodes_owner_all" on public.context_nodes
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "context_edges_owner_all" on public.context_edges
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- upsert_context_node — atomic upsert that increments ref_count + bumps
-- last_seen_at when a node already exists. Returns the row.
-- The supabase-js upsert API can't express "on conflict, increment" inline —
-- this proc owns that logic.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.upsert_context_node(
  p_owner_id        uuid,
  p_type            text,
  p_label           text,
  p_summary         text,
  p_source_research_id uuid,
  p_source_job_id   uuid,
  p_source_agent    text
)
returns public.context_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.context_nodes;
begin
  insert into public.context_nodes (
    owner_id, type, label, summary,
    source_research_id, source_job_id, source_agent
  )
  values (
    p_owner_id, p_type, p_label, p_summary,
    p_source_research_id, p_source_job_id, p_source_agent
  )
  on conflict (owner_id, type, label_norm)
  do update set
    summary = coalesce(excluded.summary, context_nodes.summary),
    source_research_id = coalesce(excluded.source_research_id, context_nodes.source_research_id),
    source_job_id = coalesce(excluded.source_job_id, context_nodes.source_job_id),
    source_agent = coalesce(excluded.source_agent, context_nodes.source_agent),
    ref_count = context_nodes.ref_count + 1,
    last_seen_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- match_context_nodes — top-k semantic search RPC.
-- Caller passes a 1536-dim embedding; we filter to their own rows and order by
-- cosine distance. Used by lib/graph/queries.ts → findRelevantContext().
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_context_nodes(
  query_embedding vector(1536),
  match_count     int default 8,
  min_similarity  float default 0.0,
  filter_types    text[] default null
)
returns table (
  id              uuid,
  type            text,
  label           text,
  summary         text,
  similarity      float,
  source_research_id uuid,
  source_job_id   uuid,
  ref_count       int,
  last_seen_at    timestamptz
)
language sql
stable
as $$
  select
    n.id,
    n.type,
    n.label,
    n.summary,
    1 - (n.embedding <=> query_embedding) as similarity,
    n.source_research_id,
    n.source_job_id,
    n.ref_count,
    n.last_seen_at
  from public.context_nodes n
  where n.owner_id = auth.uid()
    and n.embedding is not null
    and (filter_types is null or n.type = any(filter_types))
    and 1 - (n.embedding <=> query_embedding) >= min_similarity
  order by n.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- Service-role variant (used by the pipeline, which bypasses RLS).
create or replace function public.match_context_nodes_for(
  p_owner_id      uuid,
  query_embedding vector(1536),
  match_count     int default 8,
  min_similarity  float default 0.0,
  filter_types    text[] default null
)
returns table (
  id              uuid,
  type            text,
  label           text,
  summary         text,
  similarity      float,
  source_research_id uuid,
  source_job_id   uuid,
  ref_count       int,
  last_seen_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.type,
    n.label,
    n.summary,
    1 - (n.embedding <=> query_embedding) as similarity,
    n.source_research_id,
    n.source_job_id,
    n.ref_count,
    n.last_seen_at
  from public.context_nodes n
  where n.owner_id = p_owner_id
    and n.embedding is not null
    and (filter_types is null or n.type = any(filter_types))
    and 1 - (n.embedding <=> query_embedding) >= min_similarity
  order by n.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_node_neighborhood — 1-hop subgraph around a node, both directions.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_node_neighborhood(
  seed_node_id uuid,
  max_neighbors int default 25
)
returns table (
  node_id     uuid,
  node_type   text,
  node_label  text,
  node_summary text,
  edge_id     uuid,
  edge_relation text,
  edge_weight numeric,
  direction   text  -- 'out' (seed → node) or 'in' (node → seed)
)
language sql
stable
as $$
  with seed as (
    select id, owner_id from public.context_nodes
    where id = seed_node_id and owner_id = auth.uid()
    limit 1
  )
  select n.id, n.type, n.label, n.summary,
         e.id, e.relation, e.weight,
         'out'::text as direction
  from seed
  join public.context_edges e on e.from_node = seed.id and e.owner_id = seed.owner_id
  join public.context_nodes n on n.id = e.to_node
  union all
  select n.id, n.type, n.label, n.summary,
         e.id, e.relation, e.weight,
         'in'::text as direction
  from seed
  join public.context_edges e on e.to_node = seed.id and e.owner_id = seed.owner_id
  join public.context_nodes n on n.id = e.from_node
  limit greatest(max_neighbors, 1);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime: enable so the UI can subscribe to live node/edge inserts.
-- ─────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.context_nodes;
alter publication supabase_realtime add table public.context_edges;
