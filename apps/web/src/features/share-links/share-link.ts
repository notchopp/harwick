import { createHash } from "node:crypto";

/**
 * Per-agent persona-tagged share links.
 *
 * Each agent gets a stable URL per listing of the form
 *   `/[workspaceSlug]/listings/[listingId]?from=[agentSlug]&sig=[sig]`
 *
 * When a buyer arrives via the link:
 *   - The public-chat surface greets in the agent's voice persona
 *   - Captured leads route to that agent
 *   - Any FUB pushes attribute the source agent
 *   - `from` is propagated to harwick_briefs audience.voicePersona
 *
 * `sig` is a short HMAC over (workspaceId, listingId, agentMemberId) using
 * the workspace's signing secret. Stops bad actors from spoofing
 * attribution to a different agent.
 */

const SHARE_LINK_SECRET_ENV = "SHARE_LINK_SIGNING_SECRET";

function getSigningSecret(): string {
  const value = process.env[SHARE_LINK_SECRET_ENV] ?? process.env["NEXTAUTH_SECRET"] ?? "harwick-share-fallback";
  return value;
}

function agentSlug(displayName: string, memberId: string): string {
  const base = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // memberId tail keeps slugs unique across agents with similar names
  const tail = memberId.slice(0, 8);
  return base.length === 0 ? `agent-${tail}` : `${base}-${tail}`;
}

function signature(workspaceId: string, listingId: string, agentMemberId: string): string {
  const data = `${workspaceId}|${listingId}|${agentMemberId}`;
  return createHash("sha256")
    .update(data + getSigningSecret())
    .digest("hex")
    .slice(0, 10);
}

export function buildShareLink(params: {
  origin: string;
  workspaceSlug: string;
  listingId: string;
  agent: { memberId: string; displayName: string };
}): { url: string; agentSlug: string; sig: string } {
  const slug = agentSlug(params.agent.displayName, params.agent.memberId);
  const sig = signature(params.workspaceSlug, params.listingId, params.agent.memberId);
  const url = new URL(`/${params.workspaceSlug}/listings/${params.listingId}`, params.origin);
  url.searchParams.set("from", slug);
  url.searchParams.set("sig", sig);
  return { url: url.toString(), agentSlug: slug, sig };
}

export function verifyShareLinkSignature(params: {
  workspaceSlug: string;
  listingId: string;
  agentMemberId: string;
  sig: string;
}): boolean {
  return signature(params.workspaceSlug, params.listingId, params.agentMemberId) === params.sig;
}

/**
 * Default DM-share message templates — the "respectful framing" that biases
 * toward "wider access not brush-off". Agents pick one or write their own.
 * Templates use {firstName} + {listingShortAddress} + {agentFirstName}.
 */
export const DM_SHARE_TEMPLATES = [
  {
    id: "wider_access",
    label: "Wider access",
    body: "Wanted to make sure you get answers fast on {listingShortAddress} even when I'm in showings — my assistant can help you 24/7 here, get you on the calendar, send specs, anything you need: {link}. I'll see everything she sends and jump in when it makes sense.",
  },
  {
    id: "questions_in_one_place",
    label: "Drop questions",
    body: "Love that you reached out about {listingShortAddress} — drop any questions here so we have it all in one place, my assistant will start lining things up: {link}.",
  },
  {
    id: "anytime_chat",
    label: "Anytime chat",
    body: "If you want to chat about {listingShortAddress} anytime (or run a quick what-if on the numbers), here you go: {link}. — {agentFirstName}",
  },
] as const;

export function renderDmShareMessage(params: {
  templateId: string;
  link: string;
  firstName: string | null;
  listingShortAddress: string;
  agentFirstName: string;
}): string {
  const template = DM_SHARE_TEMPLATES.find((t) => t.id === params.templateId) ?? DM_SHARE_TEMPLATES[0]!;
  return template.body
    .replace("{firstName}", params.firstName ?? "")
    .replace("{listingShortAddress}", params.listingShortAddress)
    .replace("{agentFirstName}", params.agentFirstName)
    .replace("{link}", params.link)
    .trim();
}
