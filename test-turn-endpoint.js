/**
 * Simplified E2E test for Harwick AI synchronous execution
 * Tests the POST /api/.../harwick-ai/turn endpoint directly
 */
import { randomUUID } from "crypto";

const workspaceId = "649a4f39-2c40-4a51-ae2c-2ac0f8fa5d6f";

async function testAiTurnEndpoint() {
  console.log("🚀 Testing Harwick AI Turn Endpoint");
  console.log("=".repeat(60));

  const leadId = randomUUID();

  console.log(`\n📝 Test lead ID: ${leadId}`);
  console.log(`📡 Calling: POST /api/workspaces/${workspaceId}/harwick-ai/turn`);
  console.log(`📨 Payload: { leadId: "${leadId}" }`);

  try {
    const response = await fetch(
      `http://localhost:3000/api/workspaces/${workspaceId}/harwick-ai/turn`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      }
    );

    console.log(`\n📊 Response Status: ${response.status}`);

    const text = await response.text();
    let result;

    try {
      result = JSON.parse(text);
      console.log(`✓ Valid JSON response`);
    } catch (e) {
      console.error("❌ Response is not valid JSON:");
      console.error(text.substring(0, 300));
      return;
    }

    console.log(`\n📋 Response Body:`);
    console.log(JSON.stringify(result, null, 2));

    if (result.error) {
      console.error(`\n❌ Error: ${result.error}`);
    } else if (result.turnId) {
      console.log(`\n✅ AI turn created: ${result.turnId}`);
      console.log(`   Status: ${result.persistenceStatus}`);
      if (result.sent) console.log(`   ✓ Reply auto-sent`);
    }
  } catch (e) {
    console.error(`\n❌ Request failed: ${e.message}`);
  }
}

testAiTurnEndpoint();
