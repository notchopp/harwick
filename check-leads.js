import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw"
);

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";

// Get all leads
const { data: leads } = await supabase
  .from("leads")
  .select("id, full_name")
  .eq("workspace_id", workspaceId);

console.log("Leads:", leads);

// Get all social_reply_reviews
const { data: reviews } = await supabase
  .from("social_reply_reviews")
  .select("*")
  .eq("workspace_id", workspaceId);

console.log("\nSocial reply reviews:", reviews?.length || 0);
console.log(JSON.stringify(reviews, null, 2));
