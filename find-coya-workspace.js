import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw"
);

// Find Coya Test Workspace
const { data: workspaces } = await supabase
  .from("workspaces")
  .select("*")
  .like("display_name", "%Coya%");

console.log("Workspaces matching 'Coya':");
console.log(JSON.stringify(workspaces, null, 2));

if (workspaces && workspaces.length > 0) {
  const coyaWorkspace = workspaces[0];
  console.log("\n\nCoya Test Workspace ID:", coyaWorkspace.id);
  
  // Now check leads in THIS workspace
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", coyaWorkspace.id)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(10);
  
  console.log("\nLeads with messages in Coya workspace:", leads?.length || 0);
  console.log(JSON.stringify(leads, null, 2));
}
