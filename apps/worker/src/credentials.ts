import { createDecipheriv, createHash } from "node:crypto";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function decryptCredential<T>(ref: string, secret: string): T {
  if (!ref.startsWith("enc:v1:")) {
    throw new Error("Unsupported credential reference.");
  }

  const payload = Buffer.from(ref.slice("enc:v1:".length), "base64url");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}
