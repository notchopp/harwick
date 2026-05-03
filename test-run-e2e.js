import { createClient } from "@supabase/supabase-js";

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!serviceRoleKey) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function test() {
  try {
    console.log("🚀 E2E Test: Create Lead & Event for Manual API Trigger\n");

    // Step 1: Create test lead in database
    console.log("📝 Creating test lead...");
    const leadUsername = `testuser_${Date.now()}`;
    const { data: leadData, error: leadError } = await supabase
      .from("leads")
      .insert({
        workspace_id: workspaceId,
        status: "new",
        lead_type: "buyer",
        intent: "high",
        financing_status: "unknown",
        score: 0,
        instagram_username: leadUsername,
        instagram_user_id: `inst-${Date.now()}`,
        source_channel: "instagram_dm",
        source_provider_id: `test-${Date.now()}`,
      })
      .select("id")
      .single();

    if (leadError) {
      console.error(`❌ Lead creation failed:`, leadError.message);
      return;
    }

    const leadId = leadData.id;
    console.log(`✓ Lead created: ${leadId}`);
    console.log(`  Username: ${leadUsername}\n`);

    // Step 2: Create lead event in database
    console.log("📨 Creating lead event...");
    const { data: eventData, error: eventError } = await supabase
      .from("lead_events")
      .insert({
        lead_id: leadId,
        workspace_id: workspaceId,
        provider: "meta",
        event_type: "message_received",
        provider_event_id: `test-${Date.now()}`,
        provider_user_id: `test-${Date.now()}`,
        source_channel: "instagram_dm",
        text: "Looking for a 3 bed, 2 bath under $500k. What do you have?",
        occurred_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (eventError) {
      console.error(`❌ Event creation failed:`, eventError.message);
      return;
    }

    const eventId = eventData.id;
    console.log(`✓ Event created: ${eventId}\n`);

    console.log("=".repeat(70));
    console.log("✅ Ready to trigger AI!");
    console.log("=".repeat(70));
    console.log("\n📌 Now run this in your browser console (F12 → Console tab):\n");
    console.log(`\
const workspaceId = "${workspaceId}";
const leadEventId = "${eventId}";
const leadId = "${leadId}";

fetch(\`http://localhost:3000/api/workspaces/\${workspaceId}/harwick-ai/turn\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ leadEventId, leadId })
}).then(r => r.json()).then(d => {
  console.log("Response:", d);
  if (d.turnId) console.log("✅ AI Turn created! Check Conversations →");
  if (d.error) console.log("❌ Error:", d.error);
});`);

    console.log("\n🎯 Expected: AI turn ID and reply generated");
    console.log("📍 Username to find: " + leadUsername);
  } catch (e) {
    console.error("❌ Error:", e.message);
    console.error(e);
  }
}

test();
