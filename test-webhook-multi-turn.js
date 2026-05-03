import crypto from "crypto";

const appSecret = "5ded2994b268e476de077f546bbe779e";
const pageId = "17841400869465406";
const senderId = "987654321"; // Same lead ID for all messages

const messages = [
  "hey im looking for houses downtown",
  "whats available in the 500k range?",
  "can i see something this weekend?",
  "do you have 3 bed 2 bath homes?",
  "whats your availablity next week?",
];

async function sendMessage(text) {
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

  console.log(`\n📨 Sending: "${text}"`);

  const response = await fetch("http://localhost:3000/api/meta/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: payload,
  });

  const result = await response.json();
  console.log(`   Status: ${response.status}`);
  console.log(`   Accepted: ${result.accepted}`);
  if (result.leadUpsertCount > 0) console.log(`   ✓ Lead created`);
  if (result.normalizedEventCount > 0) console.log(`   ✓ Event normalized`);
}

console.log("🔄 Multi-turn conversation test (same sender, same thread)\n");

for (const msg of messages) {
  await sendMessage(msg);
  await new Promise(r => setTimeout(r, 1000)); // 1s delay between messages
}

console.log("\n✅ All messages sent! Check /conversations for the thread.\n");
