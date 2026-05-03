import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw"
);

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";

console.log("Deleting all data from workspace...");

// Delete lead_events first (FK dependency)
const { error: eventError } = await supabase
  .from("lead_events")
  .delete()
  .eq("workspace_id", workspaceId);

if (eventError) {
  console.error("Error deleting events:", eventError);
} else {
  console.log("✓ Deleted lead_events");
}

// Delete social_reply_reviews
const { error: reviewError } = await supabase
  .from("social_reply_reviews")
  .delete()
  .eq("workspace_id", workspaceId);

if (reviewError) {
  console.error("Error deleting reviews:", reviewError);
} else {
  console.log("✓ Deleted social_reply_reviews");
}

// Delete leads
const { error: leadError } = await supabase
  .from("leads")
  .delete()
  .eq("workspace_id", workspaceId);

if (leadError) {
  console.error("Error deleting leads:", leadError);
} else {
  console.log("✓ Deleted leads");
}

// Delete harwick_ai_turns
const { error: turnError } = await supabase
  .from("harwick_ai_turns")
  .delete()
  .eq("workspace_id", workspaceId);

if (turnError) {
  console.error("Error deleting turns:", turnError);
} else {
  console.log("✓ Deleted harwick_ai_turns");
}

console.log("\n✅ Database cleaned! Workspace is now empty.");
