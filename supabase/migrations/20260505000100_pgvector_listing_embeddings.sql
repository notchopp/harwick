-- Enable pgvector extension for semantic listing search.
-- Part of the AI-native migration: replaces deterministic listing lookup
-- (WHERE address ILIKE %query%) with cosine-similarity over embedded
-- listing facts. See docs/paid-launch-map.md "AI-Native Migration Track"
-- step 1.

create extension if not exists vector;

alter table public.listing_facts
  add column if not exists embedding vector(1536),
  add column if not exists embedding_text text,
  add column if not exists embedded_at timestamptz;

-- IVFFlat index for cosine similarity. Lists tuned for small workspaces;
-- raise once individual workspaces accumulate > ~10k listings.
create index if not exists listing_facts_embedding_idx
  on public.listing_facts
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- Workspace-scoped index so similarity search inside a tenant stays fast
-- even before the IVFFlat partitioning kicks in.
create index if not exists listing_facts_workspace_embedded_idx
  on public.listing_facts (workspace_id, embedded_at desc nulls last);

-- Cosine-similarity search scoped by workspace. Returns rows with similarity
-- score (1.0 = identical, 0.0 = orthogonal) ranked descending. The runtime
-- side calls this via supabase.rpc("match_listing_facts", { ... }).
create or replace function public.match_listing_facts(
  workspace uuid,
  query_embedding vector(1536),
  match_count int default 5,
  min_similarity float default 0.2
)
returns table (
  id uuid,
  workspace_id uuid,
  source text,
  external_listing_id text,
  mls_number text,
  address text,
  status text,
  price bigint,
  beds numeric,
  baths numeric,
  has_pool boolean,
  raw_facts jsonb,
  verification_status text,
  verified_by_member_id uuid,
  verified_at timestamptz,
  needs_recheck_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  embedding vector(1536),
  embedding_text text,
  embedded_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    lf.id,
    lf.workspace_id,
    lf.source,
    lf.external_listing_id,
    lf.mls_number,
    lf.address,
    lf.status,
    lf.price,
    lf.beds,
    lf.baths,
    lf.has_pool,
    lf.raw_facts,
    lf.verification_status,
    lf.verified_by_member_id,
    lf.verified_at,
    lf.needs_recheck_at,
    lf.created_at,
    lf.updated_at,
    lf.embedding,
    lf.embedding_text,
    lf.embedded_at,
    1 - (lf.embedding <=> query_embedding) as similarity
  from public.listing_facts lf
  where lf.workspace_id = workspace
    and lf.embedding is not null
    and 1 - (lf.embedding <=> query_embedding) >= min_similarity
  order by lf.embedding <=> query_embedding asc
  limit match_count;
$$;
