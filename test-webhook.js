import crypto from "crypto";

const appSecret = "5ded2994b268e476de077f546bbe779e";
const pageId = "17841400869465406";
const senderId = "987654321"; // Fake lead ID

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
            text: "hey im looking for houses downtown",
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

console.log("Signature:", signature);
console.log("Payload:", payload);

const response = await fetch("http://localhost:3000/api/meta/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-hub-signature-256": signature,
  },
  body: payload,
});

console.log("Status:", response.status);
console.log("Response:", await response.json());

