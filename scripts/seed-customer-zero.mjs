import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalEnv, requireEnvValue, runSupabaseSql } from "./supabase-management.mjs";

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envValues = await readLocalEnv(rootDirectory);
const accessToken = requireEnvValue(envValues, "SUPABASE_ACCESS_TOKEN");
const projectRef = requireEnvValue(envValues, "SUPABASE_PROJECT_REF");

const workspaceName = requireEnvValue(envValues, "REALTY_OPS_WORKSPACE_NAME");
const workspaceSlug = requireEnvValue(envValues, "REALTY_OPS_WORKSPACE_SLUG");
const ownerUserId = requireEnvValue(envValues, "REALTY_OPS_OWNER_USER_ID");
const ownerEmail = requireEnvValue(envValues, "REALTY_OPS_OWNER_EMAIL");
const ownerDisplayName = requireEnvValue(envValues, "REALTY_OPS_OWNER_DISPLAY_NAME");
const metaProviderAccountId = requireEnvValue(envValues, "REALTY_OPS_META_PROVIDER_ACCOUNT_ID");
const metaProviderAccountName = requireEnvValue(envValues, "REALTY_OPS_META_PROVIDER_ACCOUNT_NAME");

const seedSql = `
with workspace_upsert as (
  insert into public.workspaces (name, slug)
  values (${sqlString(workspaceName)}, ${sqlString(workspaceSlug)})
  on conflict (slug)
  do update set
    name = excluded.name,
    updated_at = now()
  returning id
),
workspace_target as (
  select id from workspace_upsert
  union
  select id from public.workspaces where slug = ${sqlString(workspaceSlug)}
  limit 1
),
member_upsert as (
  insert into public.workspace_members (workspace_id, user_id, role, display_name, email, is_active)
  select id, ${sqlString(ownerUserId)}::uuid, 'owner', ${sqlString(ownerDisplayName)}, ${sqlString(ownerEmail)}, true
  from workspace_target
  on conflict (workspace_id, user_id)
  do update set
    role = 'owner',
    display_name = excluded.display_name,
    email = excluded.email,
    is_active = true,
    updated_at = now()
  returning id
)
insert into public.integration_accounts (
  workspace_id,
  provider,
  status,
  provider_account_id,
  provider_account_name,
  encrypted_credential_ref,
  connected_at
)
select
  id,
  'meta',
  'connected',
  ${sqlString(metaProviderAccountId)},
  ${sqlString(metaProviderAccountName)},
  null,
  now()
from workspace_target
where not exists (
  select 1
  from public.integration_accounts
  where provider = 'meta'
    and provider_account_id = ${sqlString(metaProviderAccountId)}
);
`;

await runSupabaseSql({
  accessToken,
  projectRef,
  query: seedSql,
});

console.log(`Seeded customer-zero workspace ${workspaceSlug} for Supabase project ${projectRef}.`);

