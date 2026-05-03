import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTIyMTUsImV4cCI6MjA5MjYyODIxNX0.rKCxGlr-YNKfj9J4O92uqFcK5hkVpC_hVdv2atSPNhU"
);

const { data: leads, error } = await supabase
  .from("leads")
  .select("id, workspace_id, instagram_user_id, source_channel, status, created_at")
  .eq("workspace_id", "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f")
  .order("created_at", { ascending: false })
  .limit(10);

if (error) {
  console.error("Error:", error);
  process.exit(1);
}

console.log(`Found ${leads?.length || 0} leads:\n`);
leads?.forEach(lead => {
  console.log(`- ${lead.id}`);
  console.log(`  IG User: ${lead.instagram_user_id}`);
  console.log(`  Channel: ${lead.source_channel}`);
  console.log(`  Status: ${lead.status}`);
  console.log(`  Created: ${new Date(lead.created_at).toLocaleTimeString()}`);
  console.log();
});
