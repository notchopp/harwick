import { ImageResponse } from "next/og";

import {
  findPublicListingBySlug,
  formatWorkspaceName,
} from "../../../../features/public-listings/public-listings-loader";

export const runtime = "nodejs";
export const alt = "Listing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Open Graph image for a single listing. Layout mirrors Airbnb's share
 * card: full-bleed hero photo, dark gradient floor, address as the hero
 * line, neighborhood + price + beds/baths as quiet supporting line, the
 * workspace name as a small pill in the top-left. The card should feel
 * like a polaroid of the listing — not a promo banner.
 */
export default async function Image(props: {
  params: Promise<{ workspaceSlug: string; listingSlug: string }>;
}) {
  const { workspaceSlug, listingSlug } = await props.params;
  const workspaceName = formatWorkspaceName(workspaceSlug);
  const listing = await findPublicListingBySlug({ workspaceSlug, listingSlug });

  if (listing === null) {
    // Fallback to the workspace card if the slug doesn't resolve (deleted /
    // renamed listings should still unfurl cleanly).
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "flex-end",
            padding: "72px",
            background: "#0E0E10",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: "88px",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "rgba(255,255,255,0.98)",
              display: "flex",
            }}
          >
            {workspaceName}
          </div>
        </div>
      ),
      { ...size },
    );
  }

  const heroPhoto = listing.imageUrl;
  const supportLine = [
    listing.neighborhood,
    listing.price,
    listing.beds.length > 0 && listing.baths.length > 0
      ? `${listing.beds} bd · ${listing.baths} ba`
      : null,
  ]
    .filter((value): value is string => value !== null && value.length > 0)
    .join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0E0E10",
          position: "relative",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {heroPhoto.length > 0 ? (
          <img
            src={heroPhoto}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(14,14,16,0.35) 0%, rgba(14,14,16,0) 28%, rgba(14,14,16,0) 50%, rgba(14,14,16,0.92) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 72px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              gap: "10px",
              padding: "10px 18px",
              borderRadius: "999px",
              background: "rgba(14,14,16,0.55)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.78)",
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: "20px",
                color: "rgba(255,255,255,0.94)",
                letterSpacing: "0.01em",
                display: "flex",
              }}
            >
              {workspaceName}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              maxWidth: "1000px",
            }}
          >
            <div
              style={{
                fontSize: "76px",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                fontWeight: 600,
                color: "rgba(255,255,255,0.98)",
                display: "flex",
              }}
            >
              {listing.shortAddress}
            </div>
            {supportLine.length > 0 ? (
              <div
                style={{
                  fontSize: "26px",
                  color: "rgba(255,255,255,0.78)",
                  letterSpacing: "0.01em",
                  display: "flex",
                }}
              >
                {supportLine}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
