import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw"
);

// Get all workspaces
const { data: workspaces } = await supabase
  .from("workspaces")
  .select("*");

console.log("All workspaces:");
workspaces?.forEach(w => {
  console.log(`  ${w.display_name} (${w.id})`);
});

// For each workspace, show lead count
console.log("\n\nLeads per workspace:");
for (const workspace of workspaces || []) {
  const { data: leads } = await supabase
    .from("leads")
    .select("count", { count: "exact" })
    .eq("workspace_id", workspace.id)
    .not("last_message_at", "is", null);
  
  const { data: allLeads } = await supabase
    .from("leads")
    .select("count", { count: "exact" })
    .eq("workspace_id", workspace.id);
  
  console.log(`  ${workspace.display_name}: ${leads?.length || 0} with messages / ${allLeads?.length || 0} total`);
}
