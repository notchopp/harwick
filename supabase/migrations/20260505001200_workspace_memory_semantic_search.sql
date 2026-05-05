alter table public.workspace_memory_documents
  add column if not exists embedding_text text,
  add column if not exists embedded_at timestamptz;

create index if not exists workspace_memory_documents_embedded_idx
  on public.workspace_memory_documents (workspace_id, embedded_at desc nulls last);

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
    and 1 - (m.embedding <=> query_embedding) >= min_similarity
  order by m.embedding <=> query_embedding asc
  limit match_count;
$$;
