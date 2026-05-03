import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const appSecret = "5ded2994b268e476de077f546bbe779e";
const pageId = "17841400869465406";
const senderId = `sender_${Date.now()}`; // Unique sender per test run

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ocuaacjexbnjukzkjnpl.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTIyMTUsImV4cCI6MjA5MjYyODIxNX0.rKCxGlr-YNKfj9J4O92uqFcK5hkVpC_hVdv2atSPNhU";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let workspaceId = null;
let leadId = null;
let turnId = null;

async function findOrGetWorkspace() {
  console.log("\n🔍 Using Prestige Realty workspace...");
  
  // Prestige Realty / Coya Test workspace
  workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";
  console.log(`✓ Workspace ID: ${workspaceId}`);
  return workspaceId;
}

async function getMetaAccount() {
  // Skip Meta account check for now - focus on webhook flow
  console.log("ℹ️  Skipping Meta account check");
  return { id: "test", provider_user_id: pageId };
}

async function sendWebhookMessage(text) {
  const payload = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: pageId,
        time: Math.floor(Date.now() / 1000),
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: pageId },
            timestamp: Math.floor(Date.now() / 1000),
            message: {
              mid: "msg_" + Math.random().toString(36).substr(2, 9),
              text,
            },
          },
        ],
      },
    ],
  });

  const signature = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  console.log(`\n📨 Webhook: "${text}"`);

  const response = await fetch("http://localhost:3000/api/meta/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: payload,
  });

  const text_response = await response.text();
  let result = {};
  
  try {
    result = JSON.parse(text_response);
  } catch (e) {
    console.error(`   ❌ Invalid JSON response: ${text_response.substring(0, 100)}`);
    return null;
  }

  console.log(`   Status: ${response.status}`);
  console.log(`   Accepted: ${result.accepted}`);
  if (result.leadUpsertCount > 0) console.log(`   ✓ Lead upserted`);
  if (result.normalizedEventCount > 0) console.log(`   ✓ Event normalized`);

  return result;
}

async function checkLeadCreated() {
  console.log("\n🔍 Checking lead creation...");
  
  // Leads are looked up by: instagram_user_id (for Meta), source_provider_id, phone, or email
  // We'll look by instagram_user_id since we're simulating a Meta DM
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, source_channel, status")
    .eq("workspace_id", workspaceId)
    .eq("instagram_user_id", senderId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error fetching leads:", error);
    return null;
  }

  if (!leads || leads.length === 0) {
    console.warn("⚠️  No lead found yet (may still be processing)");
    return null;
  }

  leadId = leads[0].id;
  console.log(`✓ Lead created: ${leadId}`);
  console.log(`   Status: ${leads[0].status}`);
  console.log(`   Channel: ${leads[0].source_channel}`);

  return leads[0];
}

async function checkAiTurnCreated() {
  console.log("\n🔍 Checking AI turn...");

  if (!leadId) {
    console.warn("⚠️  No lead ID to check turns");
    return null;
  }

  const { data: turns, error } = await supabase
    .from("harwick_ai_turns")
    .select("id, status, turn, automation_decision")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error fetching turns:", error);
    return null;
  }

  if (!turns || turns.length === 0) {
    console.warn("⚠️  No AI turn found (may not have been created yet)");
    return null;
  }

  turnId = turns[0].id;
  const turn = turns[0].turn;
  const decision = turns[0].automation_decision;

  console.log(`✓ AI turn created: ${turnId}`);
  console.log(`   Status: ${turns[0].status}`);
  console.log(`   Reply: "${turn?.reply || '(none)'}".substring(0, 50)`);
  console.log(`   Can auto-execute: ${decision?.canAutoExecute}`);

  return turns[0];
}

async function checkReplyQueued() {
  console.log("\n🔍 Checking social reply queue...");

  if (!leadId) {
    console.warn("⚠️  No lead ID to check queue");
    return null;
  }

  const { data: reviews, error } = await supabase
    .from("social_reply_reviews")
    .select("id, status, suggested_reply")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error fetching reviews:", error);
    return null;
  }

  if (!reviews || reviews.length === 0) {
    console.warn("⚠️  No reply review found");
    return null;
  }

  const review = reviews[0];
  console.log(`✓ Reply queued: ${review.id}`);
  console.log(`   Status: ${review.status}`);
  console.log(`   Reply: "${review.suggested_reply || '(pending)'}".substring(0, 50)`);

  return review;
}

async function checkConversationMessages() {
  console.log("\n🔍 Checking conversation messages...");

  if (!leadId) {
    console.warn("⚠️  No lead ID to check messages");
    return null;
  }

  const { data: messages, error } = await supabase
    .from("harwick_conversation_messages")
    .select("id, kind, body, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error fetching messages:", error);
    return null;
  }

  if (!messages || messages.length === 0) {
    console.warn("⚠️  No conversation messages found");
    return null;
  }

  console.log(`✓ Found ${messages.length} message(s):`);
  messages.forEach((msg) => {
    console.log(`   [${msg.kind}] "${msg.body?.substring(0, 40)}..."`);
  });

  return messages;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("🚀 E2E Webhook Test: Meta → Lead → AI Turn → Reply");
  console.log("=".repeat(60));

  // Setup
  const ws = await findOrGetWorkspace();
  if (!ws) process.exit(1);

  const metaAccount = await getMetaAccount();
  if (!metaAccount) {
    console.warn("⚠️  No Meta account configured; webhook will still process");
  }

  // Send webhook
  await sendWebhookMessage("Hey! I'm looking for a 3 bedroom downtown. What do you have?");

  // Give it 5s for processing
  console.log("\n⏳ Waiting 5s for processing...");
  await sleep(5000);

  // Verify each stage
  const lead = await checkLeadCreated();
  await sleep(500);

  const turn = await checkAiTurnCreated();
  await sleep(500);

  const review = await checkReplyQueued();
  await sleep(500);

  const messages = await checkConversationMessages();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Flow Summary:");
  console.log(`   Lead created: ${lead ? "✓" : "✗"}`);
  console.log(`   AI turn executed: ${turn ? "✓" : "✗"}`);
  console.log(`   Reply queued: ${review ? "✓" : "✗"}`);
  console.log(`   Messages persisted: ${messages && messages.length > 0 ? "✓" : "✗"}`);

  if (lead && turn && review) {
    console.log("\n✅ Full E2E flow working!");
  } else {
    console.log("\n⚠️  Some steps failed - check output above");
  }
}

main().catch(console.error);
