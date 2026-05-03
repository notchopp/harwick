import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ocuaacjexbnjukzkjnpl.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function createPolicy() {
  const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";

  console.log("🚀 Creating automation policy for workspace...\n");

  const { data, error } = await supabase
    .from("harwick_ai_automation_policies")
    .insert({
      workspace_id: workspaceId,
      scope: "workspace",
      automation_mode: "ai_on",
      auto_send_enabled: true,
      confidence_threshold: 0.7,
      allowed_auto_actions: ["send_reply"],
      allowed_auto_tools: ["send_meta_dm", "send_meta_comment"],
      requires_approval_actions: [],
      requires_approval_tools: [],
      blocked_safety_flags: [],
    })
    .select("id")
    .single();

  if (error) {
    console.error("❌ Error creating policy:", error.message);
    return;
  }

  console.log("✓ Policy created:", data.id);
  console.log("\n📋 Policy settings:");
  console.log("  Scope: workspace (applies to all leads)");
  console.log("  Mode: ai_on (AI always on)");
  console.log("  Auto-send: enabled");
  console.log("  Allowed tools: send_meta_dm, send_meta_comment");
  console.log("  Confidence threshold: 70%");
  console.log("\n🎯 Next test: Run the AI turn again - it should auto-send now!");
}

createPolicy();
