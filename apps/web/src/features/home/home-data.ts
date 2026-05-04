import {
  ArrowBendUpRightIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
  PhoneCallIcon,
  PlugsConnectedIcon,
  SparkleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export type DeskItemTone = "hot" | "warm" | "qualified" | "syncing" | "neutral";

export type HomeSignal = {
  id: string;
  label: string;
  value: string;
  context: string;
  tone: DeskItemTone;
};

export type ImmediateMove = {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  meta: string;
  action: string;
  icon: Icon;
  tone: DeskItemTone;
};

export type ConversationLaneItem = {
  id: string;
  name: string;
  channel: string;
  summary: string;
  time: string;
  action: string;
  icon: Icon;
  tone: DeskItemTone;
};

export type ListingHighlight = {
  id: string;
  badge: string;
  price: string;
  address: string;
  meta: string;
  note: string;
  tone: DeskItemTone;
};

export type DayMoment = {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: DeskItemTone;
};

export type BriefItem = {
  id: string;
  label: string;
  detail: string;
  icon: Icon;
  tone: DeskItemTone;
};

export type TeamMember = {
  initials: string;
  name: string;
  role: string;
  load: string;
  status: "online" | "reviewing" | "away";
};

export const deskSignals: HomeSignal[] = [
  {
    id: "signal-response",
    label: "first response",
    value: "43s",
    context: "still getting faster",
    tone: "qualified",
  },
  {
    id: "signal-qualified",
    label: "qualified",
    value: "18",
    context: "ready for handoff",
    tone: "qualified",
  },
  {
    id: "signal-queue",
    label: "human review",
    value: "7",
    context: "operator queue",
    tone: "hot",
  },
  {
    id: "signal-sync",
    label: "crm sync",
    value: "96%",
    context: "quiet and healthy",
    tone: "syncing",
  },
];

export const immediateMoves: ImmediateMove[] = [
  {
    id: "move-maya",
    eyebrow: "hot lead",
    title: "Call Maya Chen before someone else does.",
    detail:
      "She asked for the Oak Forest new-build set, said pre-approval is ready, and stayed active after the DM reply.",
    meta: "Due in 45m",
    action: "Call now",
    icon: PhoneCallIcon,
    tone: "qualified",
  },
  {
    id: "move-derrick",
    eyebrow: "seller momentum",
    title: "Send Derrick the Cypress valuation note.",
    detail:
      "The reel comment turned into a real seller conversation. He wants timing, comps, and a clean next step.",
    meta: "Open reply window",
    action: "Send brief",
    icon: ArrowBendUpRightIcon,
    tone: "warm",
  },
  {
    id: "move-showing",
    eyebrow: "today's showing",
    title: "Lock the Katy Freeway logistics.",
    detail:
      "James Anderson still needs the arrival note, gate detail, and the short buyer brief before 2:30 PM.",
    meta: "Showing at 2:30 PM",
    action: "Confirm plan",
    icon: CalendarBlankIcon,
    tone: "hot",
  },
];

export const conversationLane: ConversationLaneItem[] = [
  {
    id: "lane-maya",
    name: "Maya Chen",
    channel: "instagram dm",
    summary: "Asked if the builder will cover closing costs on the Oak Forest home.",
    time: "2m ago",
    action: "Open DM",
    icon: ChatCircleTextIcon,
    tone: "qualified",
  },
  {
    id: "lane-derrick",
    name: "Derrick James",
    channel: "comment thread",
    summary: "Wants a valuation range and timeline before listing this summer.",
    time: "7m ago",
    action: "Review",
    icon: SparkleIcon,
    tone: "warm",
  },
  {
    id: "lane-nia",
    name: "Nia Brooks",
    channel: "voice callback",
    summary: "Open to lender intro, six-month buying horizon, asked for next steps.",
    time: "11m ago",
    action: "Assign",
    icon: PhoneCallIcon,
    tone: "hot",
  },
  {
    id: "lane-marcus",
    name: "Marcus Hill",
    channel: "follow up boss",
    summary: "Contact changed in FUB while the Harwick assignment is still active.",
    time: "19m ago",
    action: "Resolve",
    icon: PlugsConnectedIcon,
    tone: "syncing",
  },
];

export const listingHighlights: ListingHighlight[] = [
  {
    id: "listing-oak-forest",
    badge: "best match for Maya",
    price: "$339,000",
    address: "1243 Oak Forest Dr",
    meta: "4 bd • 3 ba • 2,104 sqft",
    note: "Builder incentive still active this week.",
    tone: "qualified",
  },
  {
    id: "listing-katy",
    badge: "showing today",
    price: "$567,800",
    address: "5678 Katy Freeway Unit 3B",
    meta: "3 bd • 2 ba • 1,650 sqft",
    note: "Use this for the 2:30 PM showing brief.",
    tone: "warm",
  },
  {
    id: "listing-sunset",
    badge: "luxury send",
    price: "$910,000",
    address: "910 Sunset Blvd",
    meta: "5 bd • 4 ba • 3,450 sqft",
    note: "Strong fit for the investor conversation from yesterday.",
    tone: "hot",
  },
];

export const dayMoments: DayMoment[] = [
  {
    id: "moment-maya",
    time: "11:00 AM",
    title: "Call Maya Chen",
    detail: "Walk the Oak Forest options and ask for the financing window.",
    tone: "qualified",
  },
  {
    id: "moment-katy",
    time: "2:30 PM",
    title: "Showing at Katy Freeway",
    detail: "Buyer brief, access note, and arrival message all need to be lined up.",
    tone: "warm",
  },
  {
    id: "moment-derrick",
    time: "4:00 PM",
    title: "Send Cypress seller note",
    detail: "Package comps, timing, and the consult invitation into one clean reply.",
    tone: "qualified",
  },
  {
    id: "moment-fub",
    time: "5:30 PM",
    title: "Resolve Marcus FUB conflict",
    detail: "Choose the owner of record before the next sync cycle lands.",
    tone: "syncing",
  },
];

export const briefItems: BriefItem[] = [
  {
    id: "brief-instagram",
    label: "Instagram is connected",
    detail: "DMs and comments are flowing into the queue without drift.",
    icon: CheckCircleIcon,
    tone: "qualified",
  },
  {
    id: "brief-voice",
    label: "Voice line is ready",
    detail: "Retell routing is healthy and callback creation is live.",
    icon: PhoneCallIcon,
    tone: "qualified",
  },
  {
    id: "brief-fub",
    label: "FUB is watching",
    detail: "One ownership conflict needs a human decision before the next write.",
    icon: PlugsConnectedIcon,
    tone: "syncing",
  },
  {
    id: "brief-nurture",
    label: "Nurture drafts are waiting",
    detail: "Two messages are ready for approval if you want them out tonight.",
    icon: SparkleIcon,
    tone: "warm",
  },
  {
    id: "brief-assignments",
    label: "Assignments need an owner",
    detail: "Three warm leads are still sitting in the desk lane without a human.",
    icon: UsersThreeIcon,
    tone: "hot",
  },
  {
    id: "brief-listing",
    label: "Listing verify task is open",
    detail: "One inventory record still needs verification before it can be sent publicly.",
    icon: BuildingsIcon,
    tone: "warm",
  },
];

export const teamMembers: TeamMember[] = [
  { initials: "ad", name: "Ademola", role: "team lead", load: "9 active", status: "online" },
  { initials: "ar", name: "Ari", role: "buyer agent", load: "6 active", status: "reviewing" },
  { initials: "dm", name: "Demi", role: "seller lead", load: "4 active", status: "online" },
  { initials: "jr", name: "Jordan", role: "agent", load: "8 active", status: "away" },
];

export const inventoryLink = {
  title: "Public inventory link",
  detail: "Use this when a call or DM needs a clean, sendable listings surface.",
  primaryAction: "Copy link",
  secondaryAction: "View activity",
};

export const homeNarrative =
  "Focus on high-priority items first. Start with Maya's call, then review the Oak Forest listing, and finally check new leads.";
