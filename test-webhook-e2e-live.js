/**
 * Authenticated E2E Test: Trigger AI execution and watch it in the UI
 * 
 * This script:
 * 1. Creates a test lead in Prestige Realty workspace
 * 2. Simulates an inbound message
 * 3. Triggers AI turn generation synchronously
 * 4. Shows the AI response appearing in real-time
 * 
 * Open http://localhost:3000/conversations in another tab to watch it live!
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";
const supabaseUrl = "https://ocuaacjexbnjukzkjnpl.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function createTestLead() {
  console.log("\n📝 Creating test lead...");

  const leadId = randomUUID();
  const senderId = `test-sender-${Date.now()}`;

  // Create lead with all required fields
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      id: leadId,
      workspace_id: workspaceId,
      source_channel: "instagram_dm",
      source_provider_id: senderId,
      instagram_user_id: senderId,
      instagram_username: `testuser_${Date.now()}`,
      status: "new",
      lead_type: "buyer",
      intent: "high",
      financing_status: "unknown",
      score: 0,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (leadError) {
    console.error("❌ Error creating lead:", leadError);
    return null;
  }

  console.log(`✓ Lead created: ${leadId}`);
  console.log(`  Name: testuser_${Date.now()}`);
  console.log(`  Status: new`);

  return { id: leadId, senderId };
}

async function getLeadEventId(leadId) {
  console.log("\n📨 Getting/creating lead event for AI processing...");

  // Check if lead has any events
  const { data: events } = await supabase
    .from("lead_events")
    .select("id")
    .eq("lead_id", leadId)
    .limit(1);

  if (events && events.length > 0) {
    console.log(`✓ Found existing event: ${events[0].id}`);
    return events[0].id;
  }

  // Create an event
  const eventId = randomUUID();
  const { error: eventError } = await supabase
    .from("lead_events")
    .insert({
      id: eventId,
      workspace_id: workspaceId,
      lead_id: leadId,
      provider: "meta",
      provider_user_id: `test-${Date.now()}`,
      source_channel: "instagram_dm",
      text: "Hey! Looking for a 3 bed, 2 bath under $500k downtown. What do you have?",
    });

  if (eventError) {
    console.warn("⚠️  Could not create event (may already exist):", eventError.code);
  } else {
    console.log(`✓ Event created: ${eventId}`);
  }

  return eventId;
}

async function triggerAiTurn(leadId) {
  console.log("\n🤖 Triggering AI Turn Execution...");
  console.log("   (This should happen synchronously, reply appears immediately)");

  const apiUrl = `http://localhost:3000/api/workspaces/${workspaceId}/harwick-ai/turn`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });

    if (response.status === 403) {
      console.error("❌ Authorization failed (missing API key or invalid workspace)");
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Error (${response.status}):`, text.substring(0, 200));
      return null;
    }

    const result = await response.json();
    console.log(`✓ AI Turn Created: ${result.turnId}`);
    console.log(`   Status: ${result.persistenceStatus}`);
    if (result.sent) console.log(`   ✓ Reply auto-sent!`);

    return result;
  } catch (e) {
    console.error(`❌ Request failed: ${e.message}`);
    return null;
  }
}

async function checkReply(leadId) {
  console.log("\n💬 Checking for AI reply...");

  const { data: messages, error } = await supabase
    .from("harwick_conversation_messages")
    .select("kind, body")
    .eq("lead_id", leadId)
    .eq("kind", "ai")
    .limit(1)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error fetching messages:", error);
    return null;
  }

  if (!messages || messages.length === 0) {
    console.warn("⚠️  No AI reply found yet");
    return null;
  }

  const reply = messages[0];
  console.log(`✓ AI Reply Found!`);
  console.log(`   "${reply.body?.substring(0, 80)}..."`);

  return reply;
}

async function main() {
  console.log("🚀 Authenticated E2E Test: AI Execution with Real-Time UI");
  console.log("=".repeat(70));
  console.log("\n💡 TIP: Open http://localhost:3000/conversations in another tab");
  console.log("   to watch the lead and AI response appear in real-time!\n");

  // Step 1: Create test lead
  const lead = await createTestLead();
  if (!lead) {
    console.error("\n❌ Failed to create lead. Exiting.");
    process.exit(1);
  }

  // Step 2: Get/create lead event
  await getLeadEventId(lead.id);

  // Step 3: Trigger AI turn
  console.log("\n⏳ Waiting for DB sync (1s)...");
  await sleep(1000);

  const aiTurn = await triggerAiTurn(lead.id);

  // Step 4: Check for reply
  console.log("\n⏳ Waiting for AI response (2s)...");
  await sleep(2000);

  const reply = await checkReply(lead.id);

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 Test Result:");
  console.log(`   Lead Created: ✓`);
  console.log(`   AI Turn Executed: ${aiTurn ? "✓" : "✗"}`);
  console.log(`   Reply Generated: ${reply ? "✓" : "✗"}`);

  if (aiTurn && reply) {
    console.log("\n✅ SUCCESS! Full E2E flow working!");
    console.log("\n🎯 Next: Check the Conversations page to see it live:");
    console.log(`   http://localhost:3000/conversations`);
    console.log(`\n   Look for the lead: testuser_${Date.now() - 1000}`);
    console.log(`   Lead ID: ${lead.id}`);
  } else {
    console.log("\n⚠️  Some steps didn't complete - check errors above");
  }
}

main().catch(console.error);
