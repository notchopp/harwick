-- Workspace memory is Harwick's brokerage-level learning layer. It stores
-- distilled cross-lead patterns separately from per-lead lead_document prose.

create table if not exists public.workspace_memory_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  memory_type text not null check (memory_type in ('pattern', 'routing', 'objection', 'market', 'policy_signal')),
  title text not null,
  body text not null,
  source text not null default 'distillation_worker' check (source in ('distillation_worker', 'operator_note', 'import', 'system')),
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_memory_documents_workspace_idx
  on public.workspace_memory_documents (workspace_id, memory_type, updated_at desc);

create index if not exists workspace_memory_documents_embedding_idx
  on public.workspace_memory_documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.workspace_memory_documents enable row level security;

drop policy if exists workspace_memory_documents_workspace_read on public.workspace_memory_documents;
create policy workspace_memory_documents_workspace_read
on public.workspace_memory_documents
for select using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_memory_documents.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator', 'agent', 'viewer')
  )
);

drop policy if exists workspace_memory_documents_workspace_manage on public.workspace_memory_documents;
create policy workspace_memory_documents_workspace_manage
on public.workspace_memory_documents
for all using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_memory_documents.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_memory_documents.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'team_lead', 'lead_manager', 'operator')
  )
);
