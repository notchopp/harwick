import { validateProductionReadiness } from "@realty-ops/core";
import { NextResponse } from "next/server";
import { getServerEnvironment } from "../../../../lib/server-env";

export const runtime = "nodejs";

export function GET() {
  const missing = validateProductionReadiness(getServerEnvironment());
  const ready = missing.length === 0;

  return NextResponse.json(
    {
      ready,
      status: ready ? "ready" : "blocked",
      missing,
    },
    { status: ready ? 200 : 503 },
  );
}
