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

  const title = `${listing.shortAddress} - ${listing.price} | ${workspaceName}`;
  const description = `${listing.beds} bed, ${listing.baths} bath ${listing.type} in ${listing.neighborhood}. Ask Harwick about availability, financing, and showing times.`;
  const canonicalPath = `/${workspaceSlug}/listings/${listing.slug}`;
  const ogImages = listing.imageUrl.length > 0
    ? [{ alt: listing.shortAddress, height: 630, url: listing.imageUrl, width: 1200 }]
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      description,
      images: ogImages,
      siteName: "Harwick",
      title,
      type: "article" as const,
      url: canonicalPath,
    },
    twitter: {
      card: "summary_large_image" as const,
      description,
      images: listing.imageUrl.length > 0 ? [listing.imageUrl] : undefined,
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
