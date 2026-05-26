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
  const lead = listings[0];

  const title = activeCount === 0
    ? `${teamName} — listings powered by Harwick`
    : `${teamName} — ${activeCount} active listing${activeCount === 1 ? "" : "s"}`;

  const neighborhoods = Array.from(new Set(listings.map((listing) => listing.neighborhood).filter((value) => value !== "Workspace listing")))
    .slice(0, 4);
  const description = activeCount === 0
    ? `Active inventory and showing requests for ${teamName}. Harwick captures every inquiry and call, 24/7.`
    : neighborhoods.length > 0
      ? `${activeCount} active listing${activeCount === 1 ? "" : "s"} from ${teamName} across ${neighborhoods.join(", ")}. Tap to ask Harwick about price, financing, or to book a showing.`
      : `${activeCount} active listing${activeCount === 1 ? "" : "s"} from ${teamName}. Tap to ask Harwick about price, financing, or to book a showing.`;

  const ogImage = lead?.imageUrl !== undefined && lead.imageUrl.length > 0 ? lead.imageUrl : undefined;
  const canonicalPath = `/${workspaceSlug}/listings`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website" as const,
      title,
      description,
      url: canonicalPath,
      siteName: "Harwick",
      ...(ogImage === undefined ? {} : { images: [{ url: ogImage, width: 1200, height: 630, alt: lead?.address ?? teamName }] }),
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      ...(ogImage === undefined ? {} : { images: [ogImage] }),
    },
  };
}

export default async function Page(props: PageProps) {
  const { workspaceSlug } = await props.params;
  const listings = await loadPublicListings(workspaceSlug);

  return <PublicListingsPage listings={listings} workspaceSlug={workspaceSlug} />;
}
