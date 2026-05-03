/**
 * Direct E2E test for Harwick AI synchronous execution
 * Bypasses webhook routing and tests the lead → AI turn → reply flow directly
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(
  "https://ocuaacjexbnjukzkjnpl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw"
);

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";
const senderIdPrefix = Date.now();

async function createTestLead() {
  console.log("\n📝 Creating test lead...");

  const leadId = randomUUID();
  const senderId = `sender-${Date.now()}`;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      id: leadId,
      workspace_id: workspaceId,
      source_channel: "instagram_dm",
      source_provider_id: senderId,
      instagram_user_id: senderId,
      instagram_username: "testuser",
      status: "new",
      lead_type: "buyer",
      intent: "high",
      financing_status: "unknown",
      score: 0,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Error creating lead:", error);
    return null;
  }

  console.log(`✓ Lead created: ${leadId}`);
  return { ...lead, senderId };
}

async function createTestLeadEvent(leadId, senderId) {
  console.log("\n📨 Creating lead event (simulating webhook)...");

  const leadEventId = randomUUID();

  const { data: event, error } = await supabase
    .from("lead_events")
    .insert({
      id: leadEventId,
      workspace_id: workspaceId,
      lead_id: leadId,
      provider: "meta",
      provider_user_id: senderId,
      source_channel: "instagram_dm",
      text: "Hey! Looking for a 3 bedroom downtown. What do you have?",
      timestamp: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Error creating lead event:", error);
    return null;
  }

  console.log(`✓ Lead event created: ${leadEventId}`);
  return event;
}

async function triggerAiTurn(leadId) {
  console.log("\n🤖 Triggering AI turn generation...");

  try {
    const response = await fetch("http://localhost:3000/api/workspaces/" + workspaceId + "/harwick-ai/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Webhook error (${response.status}):`, text.substring(0, 200));
      return null;
    }

    const result = await response.json();
    console.log(`✓ AI turn triggered: ${result.turnId}`);
    console.log(`   Status: ${result.persistenceStatus}`);
    if (result.sent) console.log(`   ✓ Reply auto-sent`);
    return result;
  } catch (e) {
    console.error("❌ Error triggering AI turn:", e.message);
    return null;
  }
}

async function checkAiTurn(turnId) {
  if (!turnId) return null;

  console.log("\n🔍 Checking AI turn...");

  const { data: turn, error } = await supabase
    .from("harwick_ai_turns")
    .select("*")
    .eq("id", turnId)
    .single();

  if (error) {
    console.error("❌ Error fetching turn:", error);
    return null;
  }

  console.log(`✓ Turn details:`);
  console.log(`   Status: ${turn.status}`);
  console.log(`   Reply: "${turn.turn?.reply || "(none)"}".substring(0, 50)`);
  console.log(`   Can auto-execute: ${turn.automation_decision?.canAutoExecute}`);

  return turn;
}

async function checkConversationMessages(leadId) {
  console.log("\n💬 Checking conversation messages...");

  const { data: messages, error } = await supabase
    .from("harwick_conversation_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error fetching messages:", error);
    return [];
  }

  if (messages?.length === 0) {
    console.warn("⚠️  No messages found");
    return [];
  }

  console.log(`✓ Found ${messages?.length || 0} message(s):`);
  messages?.forEach((msg) => {
    console.log(`   [${msg.kind}] "${msg.body?.substring(0, 40)}..."`);
  });

  return messages;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("🚀 Direct E2E Test: Lead → AI Turn → Reply");
  console.log("=".repeat(60));

  // Create test data
  const lead = await createTestLead();
  if (!lead) process.exit(1);

  const event = await createTestLeadEvent(lead.id, lead.senderId);
  if (!event) process.exit(1);

  // Give DB time to sync
  await sleep(500);

  // Trigger AI
  const aiTurn = await triggerAiTurn(lead.id);
  
  // Give AI time to execute
  await sleep(3000);

  // Check results
  if (aiTurn?.turnId) {
    await checkAiTurn(aiTurn.turnId);
  }

  await checkConversationMessages(lead.id);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Results:");
  console.log(`   Lead created: ✓`);
  console.log(`   Event created: ✓`);
  console.log(`   AI turn triggered: ${aiTurn ? "✓" : "✗"}`);
  console.log(`   AI executed: ${aiTurn?.persistenceStatus === "auto_executed" ? "✓" : "✗"}`);
  console.log(`   Reply auto-sent: ${aiTurn?.sent ? "✓" : "✗"}`);

  if (aiTurn && (aiTurn.persistenceStatus === "auto_executed" || aiTurn.persistenceStatus === "drafted")) {
    console.log("\n✅ Synchronous AI execution working!");
  } else {
    console.log("\n⚠️  Check console for errors");
  }
}

main().catch(console.error);
