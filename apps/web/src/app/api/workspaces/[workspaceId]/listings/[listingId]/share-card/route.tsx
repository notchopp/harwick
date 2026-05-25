import { UuidSchema } from "@realty-ops/core";
import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../../../lib/rate-limit";
import { createSupabaseListingFactsRepository } from "../../../../../../../lib/supabase/listings";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type ShareCardFormat = "story" | "feed" | "square";

const FORMAT_DIMENSIONS: Record<ShareCardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
};

function parseFormat(value: string | null): ShareCardFormat {
  if (value === "feed" || value === "square") return value;
  return "story";
}

function pickCoverPhoto(rawFacts: Record<string, unknown>): string | null {
  const photoUrl = rawFacts["photoUrl"];
  if (typeof photoUrl === "string" && /^https?:\/\//i.test(photoUrl)) return photoUrl;
  const mediaUrls = rawFacts["mediaUrls"];
  if (Array.isArray(mediaUrls)) {
    for (const candidate of mediaUrls) {
      if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
    }
  }
  return null;
}

function pickNeighborhood(rawFacts: Record<string, unknown>): string | null {
  const value = rawFacts["neighborhood"];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatPrice(price: number | null): string {
  if (price === null) return "Inquire for price";
  if (price >= 1_000_000) {
    return `$${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 2)}M`;
  }
  if (price >= 1_000) {
    return `$${Math.round(price / 1_000)}k`;
  }
  return `$${price}`;
}

function formatBaths(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; listingId: string }> },
) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "listing-share-card" }),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const { workspaceId: rawWorkspaceId, listingId: rawListingId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  const parsedListingId = UuidSchema.safeParse(rawListingId);
  if (!parsedWorkspaceId.success || !parsedListingId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsedWorkspaceId.data,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const repository = createSupabaseListingFactsRepository(createServerSupabaseClient());
  const listing = await repository.findListingById({
    workspaceId: parsedWorkspaceId.data,
    listingId: parsedListingId.data,
  });
  if (listing === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const format = parseFormat(request.nextUrl.searchParams.get("format"));
  const { width, height } = FORMAT_DIMENSIONS[format];
  const coverPhoto = pickCoverPhoto(listing.raw_facts);
  const neighborhood = pickNeighborhood(listing.raw_facts);
  const priceLabel = formatPrice(listing.price);
  const bedsLabel = listing.beds === null ? "—" : String(listing.beds);
  const bathsLabel = formatBaths(listing.baths);
  const workspaceLabel = membership.workspaceName ?? "Harwick";

  const accent = "#88a276";
  const overlayHeight = format === "story" ? Math.round(height * 0.42) : Math.round(height * 0.45);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#07100a",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        {coverPhoto !== null ? (
          <img
            src={coverPhoto}
            alt=""
            width={width}
            height={height}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundImage: "linear-gradient(135deg, #1d3527, #07100a 60%, #2c4632)",
              display: "flex",
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: `${overlayHeight}px`,
            backgroundImage: "linear-gradient(180deg, rgba(7,16,10,0) 0%, rgba(7,16,10,0.78) 38%, rgba(7,16,10,0.96) 100%)",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 48,
            left: 48,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 22px",
            borderRadius: 999,
            backgroundColor: "rgba(7,16,10,0.55)",
            border: "1px solid rgba(255,255,255,0.18)",
            fontSize: 26,
            fontWeight: 600,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: accent,
              display: "flex",
            }}
          />
          {workspaceLabel}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 48,
            right: 48,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 22,
              fontSize: format === "story" ? 132 : 116,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {priceLabel}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: format === "story" ? 42 : 36,
              fontWeight: 500,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.1,
            }}
          >
            {listing.address}
          </div>
          {neighborhood !== null ? (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                color: "rgba(255,255,255,0.65)",
              }}
            >
              {neighborhood}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: 18,
              marginTop: 8,
              fontSize: 32,
              fontWeight: 600,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 20px",
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              {bedsLabel} bd
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 20px",
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              {bathsLabel} ba
            </div>
            {listing.has_pool ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 20px",
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              >
                pool
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 30,
              color: accent,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            tap link in bio → full details
          </div>
        </div>
      </div>
    ),
    {
      width,
      height,
      headers: {
        "cache-control": "public, max-age=300, s-maxage=300",
        "content-disposition": `inline; filename="${format}-share-card.png"`,
      },
    },
  );
}
