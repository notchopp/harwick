import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw"
);

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";

// Get all leads in this workspace
const { data: allLeads } = await supabase
  .from("leads")
  .select("id, created_at")
  .eq("workspace_id", workspaceId)
  .order("created_at", { ascending: false });

console.log("Total leads:", allLeads?.length || 0);

// Find the newest lead
const newestLead = allLeads?.[0];
if (!newestLead) {
  console.log("No leads found");
  process.exit(0);
}

console.log("Newest lead ID:", newestLead.id, "created:", newestLead.created_at);

// Delete all older leads (keep the newest one)
const oldLeadIds = allLeads
  ?.filter(lead => lead.id !== newestLead.id)
  .map(l => l.id) || [];

if (oldLeadIds.length === 0) {
  console.log("No old leads to delete");
} else {
  console.log(`Deleting ${oldLeadIds.length} old leads...`);
  
  // Delete them
  const { error } = await supabase
    .from("leads")
    .delete()
    .in("id", oldLeadIds);

  if (error) {
    console.error("Error deleting leads:", error);
  } else {
    console.log(`✓ Deleted ${oldLeadIds.length} sandbox leads`);
    console.log("Newest lead remaining:", newestLead.id);
  }
}
