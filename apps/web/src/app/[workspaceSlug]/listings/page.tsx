import {
  PublicListingsPage,
} from "../../../features/public-listings/public-listings-page";
import {
  formatWorkspaceName,
  loadPublicListings,
} from "../../../features/public-listings/public-listings-loader";

type PageProps = {
  params: Promise<{
    workspaceSlug: string;
  }>;
};

export async function generateMetadata(props: PageProps) {
  const { workspaceSlug } = await props.params;
  const teamName = formatWorkspaceName(workspaceSlug);
  const listings = await loadPublicListings(workspaceSlug);
  const activeCount = listings.length;

  // Tab title is JUST the workspace name. Subtitle / counts belong on the
  // page, not in the OS chrome.
  const title = teamName;

  const neighborhoods = Array.from(new Set(listings.map((listing) => listing.neighborhood).filter((value) => value !== "Workspace listing")))
    .slice(0, 4);
  const description = activeCount === 0
    ? `Listings from ${teamName}.`
    : neighborhoods.length > 0
      ? `${activeCount} active listing${activeCount === 1 ? "" : "s"} from ${teamName} across ${neighborhoods.join(", ")}.`
      : `${activeCount} active listing${activeCount === 1 ? "" : "s"} from ${teamName}.`;

  const canonicalPath = `/${workspaceSlug}/listings`;

  // Note: no `images` here. Next 16 auto-wires the colocated
  // opengraph-image.tsx for both Open Graph + Twitter, which renders a
  // designed card instead of dumping a raw listing photo.
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website" as const,
      title,
      description,
      url: canonicalPath,
      siteName: teamName,
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
    },
  };
}

export default async function Page(props: PageProps) {
  const { workspaceSlug } = await props.params;
  const listings = await loadPublicListings(workspaceSlug);

  return <PublicListingsPage listings={listings} workspaceSlug={workspaceSlug} />;
}
