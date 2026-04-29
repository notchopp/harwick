import { NextResponse, type NextRequest } from "next/server";
import { postRetellWebhook } from "../webhook";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const response = await postRetellWebhook({
    rawBody,
    signature: request.headers.get("x-retell-signature"),
  });

  return NextResponse.json(response.body, {
    status: response.status,
  });
}
