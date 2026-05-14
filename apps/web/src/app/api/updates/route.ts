import { NextResponse } from "next/server";
import { loadProductUpdates } from "../../../features/activity/product-updates";

export async function GET(): Promise<NextResponse> {
  const updates = await loadProductUpdates({ limit: 10 });
  if (updates.error !== null) {
    return NextResponse.json({ error: updates.error, repository: updates.feed.repository }, { status: 502 });
  }

  return NextResponse.json(updates.feed);
}
