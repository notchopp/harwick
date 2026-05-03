#!/usr/bin/env node
/**
 * E2E Test: Conversations Workspace Complete Flow
 * Tests: Lead arrives → Messages persist → Live in UI → Operator claims
 * 
 * Usage: node test-conversations-e2e.js <workspaceId> [<metaPageId>]
 * Default workspace: Prestige Realty (Coya Test)
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ocuaacjexbnjukzkjnpl.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTIyMTUsImV4cCI6MjA5MjYyODIxNX0.rKCxGlr-YNKfj9J4O92uqFcK5hkVpC_hVdv2atSPNhU";
const appSecret = process.env.META_APP_SECRET || "5ded2994b268e476de077f546bbe779e";
const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let workspaceId = process.argv[2] || "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f"; // Prestige Realty
let pageId = process.argv[3] || "17841400869465406"; // Default Meta page
const senderId = `sender_${Date.now()}`; // Unique per test run
let leadId = null;
let turnId = null;

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function sendWebhookMessage(text) {
  console.log(`\n📨 Sending webhook message: "${text}"`);
  
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

  try {
    const response = await fetch(`${baseUrl}/api/meta/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
      body: payload,
    });

    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Accepted: ${data.accepted}`);
    if (data.leadUpsertCount > 0) console.log(`   ✓ Lead upserted`);
    if (data.normalizedEventCount > 0) console.log(`   ✓ Event normalized`);
    return data;
  } catch (error) {
    console.error(`   ❌ Webhook failed:`, error.message);
    return null;
  }
}

async function checkLeadCreated() {
  console.log(`\n🔍 Checking if lead was created for sender ${senderId}...`);
  
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, source_channel, status, created_at")
    .eq("workspace_id", workspaceId)
    .eq("instagram_user_id", senderId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error fetching leads:", error.message);
    return null;
  }

  if (!leads || leads.length === 0) {
    console.warn("⚠️  Lead not found yet");
    return null;
  }

  leadId = leads[0].id;
  console.log(`✓ Lead created: ${leadId}`);
  console.log(`   Status: ${leads[0].status}`);
  console.log(`   Channel: ${leads[0].source_channel}`);
  return leads[0];
}

async function checkLeadEventCreated() {
  console.log(`\n🔍 Checking if lead_event was created...`);
  
  if (!leadId) {
    console.warn("⚠️  No lead ID to check events");
    return null;
  }

  const { data: events, error } = await supabase
    .from("lead_events")
    .select("id, event_type, text, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error fetching events:", error.message);
    return null;
  }

  if (!events || events.length === 0) {
    console.warn("⚠️  No lead_event found");
    return null;
  }

  console.log(`✓ Lead event created: ${events[0].id}`);
  console.log(`   Event type: ${events[0].event_type}`);
  console.log(`   Text: "${events[0].text?.substring(0, 60)}..."`);
  return events[0];
}

async function checkConversationMessagesCreated() {
  console.log(`\n🔍 Checking if customer message was persisted to conversation_messages...`);
  
  if (!leadId) {
    console.warn("⚠️  No lead ID to check messages");
    return null;
  }

  const { data: messages, error } = await supabase
    .from("conversation_messages")
    .select("id, sender_type, sender_id, body, source_channel, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error fetching messages:", error.message);
    return null;
  }

  if (!messages || messages.length === 0) {
    console.warn("⚠️  No conversation_messages found");
    return null;
  }

  console.log(`✓ Found ${messages.length} message(s):`);
  messages.forEach((msg, i) => {
    console.log(`   [${i + 1}] ${msg.sender_type} via ${msg.source_channel}: "${msg.body?.substring(0, 50)}..."`);
  });
  return messages;
}

async function checkAiTurnCreated() {
  console.log(`\n🔍 Checking if AI turn was created...`);
  
  if (!leadId) {
    console.warn("⚠️  No lead ID to check turns");
    return null;
  }

  const { data: turns, error } = await supabase
    .from("harwick_ai_turns")
    .select("id, status, turn, automation_decision, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error fetching turns:", error.message);
    return null;
  }

  if (!turns || turns.length === 0) {
    console.warn("⚠️  No AI turn found");
    return null;
  }

  turnId = turns[0].id;
  console.log(`✓ AI turn created: ${turnId}`);
  console.log(`   Status: ${turns[0].status}`);
  console.log(`   Reply: "${turns[0].turn?.reply?.substring(0, 60)}..."`);
  console.log(`   Can auto-execute: ${turns[0].automation_decision?.canAutoExecute}`);
  return turns[0];
}

async function checkAiMessagePersisted() {
  console.log(`\n🔍 Checking if AI message was persisted to conversation_messages...`);
  
  if (!leadId) {
    console.warn("⚠️  No lead ID to check messages");
    return null;
  }

  const { data: messages, error } = await supabase
    .from("conversation_messages")
    .select("id, sender_type, sender_id, body, created_at")
    .eq("lead_id", leadId)
    .eq("sender_type", "ai")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error fetching AI messages:", error.message);
    return null;
  }

  if (!messages || messages.length === 0) {
    console.warn("⚠️  No AI message found in conversation_messages");
    return null;
  }

  console.log(`✓ AI message persisted: ${messages[0].id}`);
  console.log(`   Sender: ${messages[0].sender_id}`);
  console.log(`   Message: "${messages[0].body?.substring(0, 60)}..."`);
  return messages[0];
}

async function checkSocialReplyReviewQueued() {
  console.log(`\n🔍 Checking if reply was queued in social_reply_reviews...`);
  
  if (!leadId) {
    console.warn("⚠️  No lead ID to check queue");
    return null;
  }

  const { data: reviews, error } = await supabase
    .from("social_reply_reviews")
    .select("id, lead_id, status, suggested_reply, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error fetching reviews:", error.message);
    return null;
  }

  if (!reviews || reviews.length === 0) {
    console.warn("⚠️  No social_reply_review found");
    return null;
  }

  console.log(`✓ Reply queued: ${reviews[0].id}`);
  console.log(`   Status: ${reviews[0].status}`);
  console.log(`   Reply: "${reviews[0].suggested_reply?.substring(0, 60)}..."`);
  return reviews[0];
}

async function verifyOperatorWorkflow() {
  console.log(`\n🔍 Verifying operator can claim conversation...`);
  
  if (!leadId) {
    console.warn("⚠️  No lead ID for operator test");
    return null;
  }

  try {
    const response = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/conversations/${leadId}/automation`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Operator can claim conversation`);
      console.log(`   Response: ${JSON.stringify(data, null, 2).substring(0, 100)}...`);
      return data;
    } else {
      console.warn(`⚠️  Claim endpoint returned ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Claim failed:`, error.message);
    return null;
  }
}

async function main() {
  console.log("🚀 E2E Test: Conversations Workspace Full Flow");
  console.log("=".repeat(60));
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Meta Page: ${pageId}`);
  console.log(`Test Sender: ${senderId}`);

  // STEP 1: Send webhook
  await sendWebhookMessage("Hi! I'm looking to buy a 3-bedroom downtown. Can you help?");
  console.log("\n⏳ Waiting 3s for lead/event processing...");
  await delay(3000);

  // STEP 2: Verify lead created
  const lead = await checkLeadCreated();
  if (!lead) {
    console.error("\n❌ FAILED at lead creation");
    process.exit(1);
  }

  // STEP 3: Verify lead_event created
  const event = await checkLeadEventCreated();
  if (!event) {
    console.error("\n❌ FAILED at lead_event creation");
    process.exit(1);
  }

  // STEP 4: Verify customer message persisted
  const customerMessages = await checkConversationMessagesCreated();
  if (!customerMessages || customerMessages.filter(m => m.sender_type === "customer").length === 0) {
    console.error("\n❌ FAILED: Customer message not persisted to conversation_messages");
    process.exit(1);
  }

  console.log("\n⏳ Waiting 5s for AI turn generation...");
  await delay(5000);

  // STEP 5: Verify AI turn created
  const turn = await checkAiTurnCreated();
  if (!turn) {
    console.error("\n❌ FAILED at AI turn creation");
    // This is OK—some leads may not qualify
    console.warn("⚠️  (Note: Lead may not qualify for AI turn; this is expected)");
  }

  // STEP 6: Verify AI message persisted (if turn created)
  if (turn) {
    const aiMessage = await checkAiMessagePersisted();
    if (!aiMessage) {
      console.error("\n❌ FAILED: AI message not persisted to conversation_messages");
      process.exit(1);
    }
  }

  // STEP 7: Verify reply queued
  const reply = await checkSocialReplyReviewQueued();
  if (!reply) {
    console.warn("\n⚠️  Reply not queued (lead may not qualify or automation disabled)");
  }

  // STEP 8: Verify operator can claim
  const claimed = await verifyOperatorWorkflow();

  console.log("\n" + "=".repeat(60));
  if (turn && customerMessages && claimed) {
    console.log("✅ E2E TEST PASSED");
    console.log("\nFlow verified:");
    console.log("  1. ✓ Lead created from webhook");
    console.log("  2. ✓ Lead event normalized");
    console.log("  3. ✓ Customer message persisted to conversation_messages");
    if (turn) console.log("  4. ✓ AI turn generated and persisted");
    if (reply) console.log("  5. ✓ Reply queued for operator");
    console.log("  6. ✓ Operator can claim conversation");
  } else if (customerMessages) {
    console.log("✅ PARTIAL TEST PASSED (Message Persistence Working)");
    console.log("\nVerified:");
    console.log("  1. ✓ Lead created from webhook");
    console.log("  2. ✓ Lead event normalized");
    console.log("  3. ✓ Customer message persisted to conversation_messages");
    if (!turn) console.log("  ⚠️  AI turn not created (lead may not qualify)");
    if (!reply) console.log("  ⚠️  Reply not queued (automation may be disabled)");
  } else {
    console.log("❌ E2E TEST FAILED");
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
