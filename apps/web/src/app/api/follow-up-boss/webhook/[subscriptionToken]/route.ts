import { NextResponse, type NextRequest } from "next/server";
import { postFollowUpBossWebhook } from "../../webhook";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      subscriptionToken: string;
    }>;
  },
) {
  const { subscriptionToken } = await context.params;
  const response = await postFollowUpBossWebhook({
    subscriptionToken,
    rawBody: await request.text(),
    signature: request.headers.get("fub-signature"),
  });

  return NextResponse.json(response.body, {
    status: response.status,
  });
}
