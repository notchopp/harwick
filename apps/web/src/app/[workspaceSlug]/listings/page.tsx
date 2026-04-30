import { PublicListingsPage } from "../../../features/public-listings/public-listings-page";

type PageProps = {
  params: Promise<{
    workspaceSlug: string;
  }>;
};

export async function generateMetadata(props: PageProps) {
  const { workspaceSlug } = await props.params;
  const teamName = workspaceSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    title: `${teamName} listings`,
    description: `Active listings and showing requests for ${teamName}.`,
  };
}

export default async function Page(props: PageProps) {
  const { workspaceSlug } = await props.params;

  return <PublicListingsPage workspaceSlug={workspaceSlug} />;
}
