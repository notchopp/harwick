import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ocuaacjexbnjukzkjnpl.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";

  const { data, error } = await supabase
    .from("harwick_ai_automation_policies")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("❌ Error:", error.message);
    return;
  }

  console.log("✓ Found", data.length, "policies");
  data.forEach((p) => {
    console.log({
      id: p.id,
      scope: p.scope,
      automation_mode: p.automation_mode,
      auto_send_enabled: p.auto_send_enabled,
      allowed_auto_tools: p.allowed_auto_tools,
    });
  });
}

check();
