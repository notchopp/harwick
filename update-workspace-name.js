import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw"
);

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";

const { error } = await supabase
  .from("workspaces")
  .update({ 
    name: "Prestige Realty",
    slug: "prestige-realty"
  })
  .eq("id", workspaceId);

if (error) {
  console.error("Error updating workspace:", error);
} else {
  console.log("✓ Workspace updated to 'Prestige Realty'");
}
