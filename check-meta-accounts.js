import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTIyMTUsImV4cCI6MjA5MjYyODIxNX0.rKCxGlr-YNKfj9J4O92uqFcK5hkVpC_hVdv2atSPNhU"
);

const { data: accounts, error } = await supabase
  .from("integration_accounts")
  .select("*")
  .eq("workspace_id", "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f")
  .eq("provider", "meta");

if (error) {
  console.error("Error:", error);
  process.exit(1);
}

console.log(`Found ${accounts?.length || 0} Meta accounts:\n`);
accounts?.forEach(account => {
  console.log(`Account ID: ${account.id}`);
  console.log(JSON.stringify(account, null, 2));
  console.log();
});
