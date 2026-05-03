/**
 * 🚀 BROWSER CONSOLE TEST
 * 
 * Copy and paste this entire script into your browser console (F12)
 * while logged into http://localhost:3000
 * 
 * This will:
 * 1. Create a test lead
 * 2. Trigger AI execution
 * 3. Show the response in console
 * 4. You'll see it appear live in the Conversations page!
 */

console.log("🚀 Starting E2E Test from Browser Console...\n");

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";

async function test() {
  try {
    // Step 1: Create a test lead
    console.log("📝 Creating test lead...");
    const leadResponse = await fetch("/api/workspaces/" + workspaceId + "/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceChannel: "instagram_dm",
        sourceProviderId: `test-${Date.now()}`,
        instagramUserId: `test-${Date.now()}`,
        instagramUsername: `testuser_${Date.now()}`,
        status: "new",
        leadType: "buyer",
        intent: "high",
        financingStatus: "unknown",
        score: 0,
      }),
    });

    if (!leadResponse.ok) {
      console.error("❌ Failed to create lead:", leadResponse.status);
      console.error(await leadResponse.text());
      return;
    }

    const { id: leadId } = await leadResponse.json();
    console.log("✓ Lead created:", leadId);

    // Step 2: Create a lead event
    console.log("\n📨 Creating lead event...");
    const eventResponse = await fetch("/api/workspaces/" + workspaceId + "/lead-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        provider: "meta",
        providerUserId: `test-${Date.now()}`,
        sourceChannel: "instagram_dm",
        text: "Hey! Looking for a 3 bed, 2 bath under $500k in the downtown area. What do you have available?",
      }),
    });

    if (!eventResponse.ok) {
      console.error("❌ Failed to create event:", eventResponse.status);
      console.error(await eventResponse.text());
      return;
    }

    const event = await eventResponse.json();
    console.log("✓ Event created:", event.id);

    // Step 3: Wait a second for DB sync
    await new Promise(r => setTimeout(r, 1000));

    // Step 4: Trigger AI turn
    console.log("\n🤖 Triggering AI Turn Execution...");
    const turnResponse = await fetch("/api/workspaces/" + workspaceId + "/harwick-ai/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadEventId: event.id, leadId }),
    });

    if (!turnResponse.ok) {
      console.error("❌ Failed to trigger AI:", turnResponse.status);
      console.error(await turnResponse.text());
      return;
    }

    const turn = await turnResponse.json();
    console.log("✓ AI Turn Created:", turn.turnId);
    console.log("  Status:", turn.persistenceStatus);
    if (turn.sent) console.log("  ✓ Reply auto-sent!");

    // Final message
    console.log("\n" + "=".repeat(70));
    console.log("✅ SUCCESS! E2E Flow Complete");
    console.log("\n🎯 Now open the Conversations page to see it live:");
    console.log("   http://localhost:3000/conversations");
    console.log(`\n   Look for lead: testuser_${Math.floor(Date.now() / 1000)}`);
    console.log(`   Lead ID: ${leadId}`);
    console.log("\n💡 You should see:");
    console.log("   - Inbound message from test user");
    console.log("   - AI-generated reply appearing in real-time");
    console.log("=".repeat(70));

  } catch (e) {
    console.error("❌ Error:", e.message);
    console.error(e);
  }
}

// Run the test
test();
