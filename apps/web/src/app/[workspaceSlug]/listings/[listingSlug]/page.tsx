import { notFound } from "next/navigation";

import { PublicListingDetailPage } from "../../../../features/public-listings/public-listings-page";
import {
  findPublicListingBySlug,
  formatWorkspaceName,
} from "../../../../features/public-listings/public-listings-loader";

type PageProps = {
  params: Promise<{
    workspaceSlug: string;
    listingSlug: string;
  }>;
};

export async function generateMetadata(props: PageProps) {
  const { workspaceSlug, listingSlug } = await props.params;
  const workspaceName = formatWorkspaceName(workspaceSlug);
  const listing = await findPublicListingBySlug({ workspaceSlug, listingSlug });

  if (listing === null) {
    return {
      title: `${workspaceName} listing`,
      robots: { follow: false, index: false },
    };
  }

  // Tab format: "Address · Workspace" (middle-dot, not hyphen-pipe).
  // Price + beds/baths belong on the page, not in the OS chrome.
  const title = `${listing.shortAddress} · ${workspaceName}`;
  const description = listing.beds.length > 0 && listing.baths.length > 0
    ? `${listing.beds} bd, ${listing.baths} ba · ${listing.price} in ${listing.neighborhood}.`
    : `${listing.type} in ${listing.neighborhood} · ${listing.price}.`;
  const canonicalPath = `/${workspaceSlug}/listings/${listing.slug}`;

  // Note: no `images` here. Next 16 auto-wires the colocated
  // opengraph-image.tsx, which renders the listing photo with a clean
  // address + price overlay (Airbnb-style) instead of a raw image dump.
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      description,
      siteName: workspaceName,
      title,
      type: "article" as const,
      url: canonicalPath,
    },
    twitter: {
      card: "summary_large_image" as const,
      description,
      title,
    },
  };
}

export default async function Page(props: PageProps) {
  const { workspaceSlug, listingSlug } = await props.params;
  const listing = await findPublicListingBySlug({ workspaceSlug, listingSlug });

  if (listing === null) {
    notFound();
  }

  return <PublicListingDetailPage listing={listing} workspaceSlug={workspaceSlug} />;
}
