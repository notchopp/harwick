import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Harwick Listings",
  },
  other: {
    "color-scheme": "dark",
    "mobile-web-app-capable": "yes",
    "supported-color-schemes": "dark",
  },
};

/**
 * NOTE: viewportFit is INTENTIONALLY not "cover" here. An earlier pass set
 * it to "cover" to let the dark theme run edge-to-edge under the iOS
 * status bar, but on non-PWA mobile Safari the env(safe-area-inset-top)
 * value needed to push the sticky header back below the notch is unreliable
 * — header content (workspace chip + "ask harwick" button) ends up clipped
 * by the OS status bar overlay. Leaving viewportFit at the default keeps
 * the page contained below the OS chrome; themeColor still colors that
 * status-bar strip dark so the visual continuity is preserved.
 */
export const viewport: Viewport = {
  themeColor: "#0a0f0c",
  interactiveWidget: "resizes-content",
};

/**
 * Inline SSR style that kills the white flash on the public listings
 * surface. The root layout owns <html>/<body> so it can't conditionally
 * apply a class for this segment; Codex's client-side
 * `usePublicListingDarkBrowserChrome` hook covers post-hydration, and the
 * `:has([data-public-listings-shell="true"])` rule in globals.css covers
 * modern browsers — but BOTH only kick in after the descendant lands in
 * the DOM. During streaming SSR the body paints with the inherited light
 * `var(--color-background)` for one-to-three frames before that match
 * happens. This <style> tag is rendered as the layout's first child, so
 * it lands in the body BEFORE the page content and the dark background
 * applies on the very first paint.
 *
 * The `!important` is load-bearing — it beats globals.css's
 * `body { background: var(--color-background); }` rule which has
 * specificity (0,0,0,1). When users navigate away from /listings, this
 * layout unmounts and the style tag goes with it, so operator-side
 * chrome (parchment + light) is fully restored.
 */
const PUBLIC_LISTINGS_DARK_PREPAINT_STYLE = `
:root, html, body {
  background: #0a0f0c !important;
  color-scheme: dark !important;
}
html { min-height: 100dvh; }
body { color: #ffffff !important; }
`.trim();

export default function PublicListingsLayout(props: { children: ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PUBLIC_LISTINGS_DARK_PREPAINT_STYLE }} />
      {props.children}
    </>
  );
}
