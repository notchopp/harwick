import { ImageResponse } from "next/og";

import {
  formatWorkspaceName,
  loadPublicListings,
} from "../../../features/public-listings/public-listings-loader";

export const runtime = "nodejs";
export const alt = "Listings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Open Graph image for the workspace's listings index. Layout: dark canvas,
 * first listing's hero photo as a soft backdrop with dark gradient on top,
 * bottom-left aligned workspace name in clean sans, small eyebrow label
 * above it. No clutter — Apple/Airbnb restraint over feature density.
 */
export default async function Image(props: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await props.params;
  const workspaceName = formatWorkspaceName(workspaceSlug);
  const listings = await loadPublicListings(workspaceSlug);
  const heroPhoto = listings[0]?.imageUrl ?? "";

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
              opacity: 0.42,
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(14,14,16,0.45) 0%, rgba(14,14,16,0.78) 55%, rgba(14,14,16,0.96) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "72px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              maxWidth: "920px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "1px",
                  background: "rgba(255,255,255,0.32)",
                  display: "flex",
                }}
              />
              <div
                style={{
                  fontSize: "20px",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.56)",
                  display: "flex",
                }}
              >
                Listings
              </div>
            </div>
            <div
              style={{
                fontSize: "104px",
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                fontWeight: 600,
                color: "rgba(255,255,255,0.98)",
                display: "flex",
              }}
            >
              {workspaceName}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
