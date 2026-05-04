import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaSignedRequestPayload = {
  user_id: string;
  algorithm: string;
  issued_at?: number;
  expires?: number;
};

export type ParsedSignedRequest =
  | { ok: true; payload: MetaSignedRequestPayload }
  | { ok: false; reason: "missing" | "malformed" | "bad_signature" | "unsupported_algorithm" };

function base64UrlDecodeToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function parseAndVerifyMetaSignedRequest(params: {
  signedRequest: string | null | undefined;
  appSecret: string;
}): ParsedSignedRequest {
  if (params.signedRequest === null || params.signedRequest === undefined || params.signedRequest.length === 0) {
    return { ok: false, reason: "missing" };
  }

  const dot = params.signedRequest.indexOf(".");
  if (dot <= 0 || dot === params.signedRequest.length - 1) {
    return { ok: false, reason: "malformed" };
  }

  const encodedSignature = params.signedRequest.slice(0, dot);
  const encodedPayload = params.signedRequest.slice(dot + 1);

  let signature: Buffer;
  let payloadJson: string;
  try {
    signature = base64UrlDecodeToBuffer(encodedSignature);
    payloadJson = base64UrlDecodeToBuffer(encodedPayload).toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", params.appSecret).update(encodedPayload).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: MetaSignedRequestPayload;
  try {
    payload = JSON.parse(payloadJson) as MetaSignedRequestPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.algorithm !== "HMAC-SHA256") {
    return { ok: false, reason: "unsupported_algorithm" };
  }

  if (typeof payload.user_id !== "string" || payload.user_id.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, payload };
}
