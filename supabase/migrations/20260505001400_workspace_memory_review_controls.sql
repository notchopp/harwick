-- Review controls let team leads approve or dismiss Harwick's workspace-level
-- memories before they become trusted brokerage operating context.

alter table public.workspace_memory_documents
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'dismissed')),
  add column if not exists reviewed_by_member_id uuid references public.workspace_members(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

create index if not exists workspace_memory_documents_review_idx
  on public.workspace_memory_documents (workspace_id, review_status, updated_at desc);

create or replace function public.match_workspace_memory_documents(
  workspace uuid,
  query_embedding vector(1536),
  match_count int default 5,
  min_similarity float default 0.2
)
returns table (
  id uuid,
  workspace_id uuid,
  memory_type text,
  title text,
  body text,
  source text,
  confidence numeric,
  evidence jsonb,
  last_observed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  embedding_text text,
  embedded_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    m.id,
    m.workspace_id,
    m.memory_type,
    m.title,
    m.body,
    m.source,
    m.confidence,
    m.evidence,
    m.last_observed_at,
    m.created_at,
    m.updated_at,
    m.embedding_text,
    m.embedded_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.workspace_memory_documents m
  where m.workspace_id = workspace
    and m.embedding is not null
    and m.review_status <> 'dismissed'
    and 1 - (m.embedding <=> query_embedding) >= min_similarity
  order by m.embedding <=> query_embedding asc
  limit match_count;
$$;
