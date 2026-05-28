import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalEnv, requireEnvValue } from "./supabase-management.mjs";

const SYNTHETIC_PREFIX = "synthetic:houston-brokerage";
const SYNTHETIC_DOMAIN = "synthetic.harwick.local";
const DEFAULT_WORKSPACE_NAME = "Views of TX Realty Synthetic";
const DEFAULT_WORKSPACE_SLUG = "views-of-tx-synthetic";

function parseArgs(argv) {
  const options = {
    reset: false,
    targetCurrentWorkspace: false,
    generateAiDrafts: false,
    enqueueAutoSendJobs: false,
    wipeTargetWorkspace: false,
  };

  for (const arg of argv) {
    if (arg === "--reset") options.reset = true;
    else if (arg === "--target-current-workspace") options.targetCurrentWorkspace = true;
    else if (arg === "--generate-ai-drafts") options.generateAiDrafts = true;
    else if (arg === "--enqueue-auto-send-jobs") options.enqueueAutoSendJobs = true;
    else if (arg === "--wipe-target-workspace") options.wipeTargetWorkspace = true;
    else if (arg.startsWith("--workspace-id=")) options.workspaceId = arg.slice("--workspace-id=".length);
    else if (arg.startsWith("--workspace-slug=")) options.workspaceSlug = arg.slice("--workspace-slug=".length);
    else if (arg.startsWith("--workspace-name=")) options.workspaceName = arg.slice("--workspace-name=".length);
    else if (arg.startsWith("--owner-email=")) options.ownerEmail = arg.slice("--owner-email=".length);
    else if (arg.startsWith("--owner-user-id=")) options.ownerUserId = arg.slice("--owner-user-id=".length);
    else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function daysFromNow(days, hours = 0) {
  const date = new Date(Date.now() + (days * 24 + hours) * 60 * 60 * 1000);
  return date.toISOString();
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

async function findUserByEmail(supabase, email) {
  let page = 1;
  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error !== null) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match !== undefined) return match;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}

async function requireOwnerUser(supabase, envValues, options) {
  const ownerUserId = options.ownerUserId ?? envValues.get("REALTY_OPS_OWNER_USER_ID");
  if (ownerUserId !== undefined && ownerUserId.trim().length > 0) {
    const { data, error } = await supabase.auth.admin.getUserById(ownerUserId);
    if (error !== null) throw error;
    if (data.user === null) throw new Error(`Owner user id not found: ${ownerUserId}`);
    return data.user;
  }

  const ownerEmail = options.ownerEmail ?? envValues.get("REALTY_OPS_OWNER_EMAIL");
  if (ownerEmail === undefined || ownerEmail.trim().length === 0) {
    throw new Error("Provide --owner-email, --owner-user-id, or REALTY_OPS_OWNER_EMAIL / REALTY_OPS_OWNER_USER_ID in .env.local.");
  }

  const user = await findUserByEmail(supabase, ownerEmail);
  if (user === null) throw new Error(`Owner user not found for email: ${ownerEmail}`);
  return user;
}

async function upsertWorkspace(supabase, envValues, options, ownerUser) {
  if (options.workspaceId !== undefined) {
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", options.workspaceId)
      .single();
    if (error !== null) throw error;
    return data;
  }

  const workspaceSlug = options.targetCurrentWorkspace
    ? options.workspaceSlug ?? envValues.get("REALTY_OPS_WORKSPACE_SLUG")
    : options.workspaceSlug ?? DEFAULT_WORKSPACE_SLUG;
  if (workspaceSlug === undefined || workspaceSlug.trim().length === 0) {
    throw new Error("Current workspace targeting requires --workspace-slug or REALTY_OPS_WORKSPACE_SLUG.");
  }

  const workspaceName = options.targetCurrentWorkspace
    ? options.workspaceName ?? envValues.get("REALTY_OPS_WORKSPACE_NAME") ?? "Current Workspace"
    : options.workspaceName ?? DEFAULT_WORKSPACE_NAME;

  if (!options.targetCurrentWorkspace) {
    const { data: existing } = await supabase
      .from("workspaces")
      .select("id")
      .eq("slug", workspaceSlug)
      .maybeSingle();
    if (options.reset && existing !== null) {
      const { error } = await supabase.from("workspaces").delete().eq("id", existing.id);
      if (error !== null) throw error;
    }
  }

  const { data, error } = await supabase
    .from("workspaces")
    .upsert({
      name: workspaceName,
      slug: workspaceSlug,
      policy_narrative: "Harwick may answer safe buyer qualification questions automatically. Harwick must not claim lending certainty, legal certainty, contract terms, or exact listing availability without verified listing facts. Showing requests, routing, and CRM writes stay reviewable unless explicitly approved.",
      policy_narrative_source: "manual",
      policy_narrative_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "slug" })
    .select("*")
    .single();
  if (error !== null) throw error;

  const { error: memberError } = await supabase
    .from("workspace_members")
    .upsert({
      workspace_id: data.id,
      user_id: ownerUser.id,
      role: "owner",
      role_label: "Team lead",
      display_name: ownerUser.user_metadata?.display_name ?? ownerUser.email ?? "Owner",
      email: ownerUser.email,
      is_active: true,
      presence_status: "online",
      presence_last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,user_id" });
  if (memberError !== null) throw memberError;

  return data;
}

async function ensureSyntheticUser(supabase, name) {
  const email = `${slugify(name)}@${SYNTHETIC_DOMAIN}`;
  const existing = await findUserByEmail(supabase, email);
  if (existing !== null) return existing;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomUUID() + randomUUID(),
    user_metadata: { display_name: name, syntheticSeed: SYNTHETIC_PREFIX },
  });
  if (error !== null) throw error;
  if (data.user === null) throw new Error(`Failed to create synthetic user ${email}`);
  return data.user;
}

async function resetSyntheticRows(supabase, workspaceId) {
  const { data: syntheticLeads, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .like("source_provider_id", `${SYNTHETIC_PREFIX}%`);
  if (leadError !== null) throw leadError;
  const leadIds = (syntheticLeads ?? []).map((lead) => lead.id);

  await checkedDelete(supabase.from("workflow_jobs").delete().eq("workspace_id", workspaceId).like("idempotency_key", `${SYNTHETIC_PREFIX}%`));
  if (leadIds.length > 0) {
    await checkedDelete(supabase.from("harwick_ai_tool_calls").delete().eq("workspace_id", workspaceId).in("lead_id", leadIds));
    await checkedDelete(supabase.from("harwick_ai_turns").delete().eq("workspace_id", workspaceId).in("lead_id", leadIds));
    await checkedDelete(supabase.from("conversation_messages").delete().eq("workspace_id", workspaceId).in("lead_id", leadIds));
    await checkedDelete(supabase.from("crm_sync_logs").delete().eq("workspace_id", workspaceId).in("lead_id", leadIds));
    await checkedDelete(supabase.from("voice_lead_handoffs").delete().eq("workspace_id", workspaceId).in("lead_id", leadIds));
    await checkedDelete(supabase.from("lead_tasks").delete().eq("workspace_id", workspaceId).in("lead_id", leadIds));
    await checkedDelete(supabase.from("social_reply_reviews").delete().eq("workspace_id", workspaceId).in("lead_id", leadIds));
    await checkedDelete(supabase.from("lead_events").delete().eq("workspace_id", workspaceId).in("lead_id", leadIds));
    await checkedDelete(supabase.from("leads").delete().eq("workspace_id", workspaceId).in("id", leadIds));
  }
  await checkedDelete(supabase.from("social_posts").delete().eq("workspace_id", workspaceId).like("source_post_id", `${SYNTHETIC_PREFIX}%`));
  await checkedDelete(supabase.from("listing_facts").delete().eq("workspace_id", workspaceId).like("external_listing_id", `${SYNTHETIC_PREFIX}%`));
}

async function wipeTargetWorkspaceRows(supabase, workspaceId) {
  if (process.env.CONFIRM_SYNTHETIC_WIPE !== "WIPE_CURRENT_WORKSPACE") {
    throw new Error("Refusing full workspace wipe. Set CONFIRM_SYNTHETIC_WIPE=WIPE_CURRENT_WORKSPACE and pass --wipe-target-workspace intentionally.");
  }
  await checkedDelete(supabase.from("workflow_jobs").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("harwick_ai_tool_calls").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("harwick_ai_turns").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("social_reply_reviews").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("voice_lead_handoffs").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("conversation_messages").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("crm_sync_logs").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("lead_tasks").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("lead_events").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("leads").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("social_posts").delete().eq("workspace_id", workspaceId));
  await checkedDelete(supabase.from("listing_facts").delete().eq("workspace_id", workspaceId));
}

async function checkedDelete(query) {
  const { error } = await query;
  if (error !== null) throw error;
}

const teamSeed = [
  {
    name: "Ademola",
    role: "owner",
    roleLabel: "Rainmaker / team lead",
    areas: ["Katy", "Cypress", "Richmond", "Sugar Land"],
    propertyTypes: ["new_construction", "single_family", "townhome"],
    leadTypes: ["buyer", "seller"],
    budgetMin: 250000,
    budgetMax: 650000,
    maxActiveLeads: 18,
  },
  {
    name: "Tiana Brooks",
    role: "agent",
    roleLabel: "New construction specialist",
    areas: ["Katy", "Fulshear", "Richmond"],
    propertyTypes: ["new_construction", "single_family"],
    leadTypes: ["buyer"],
    budgetMin: 240000,
    budgetMax: 520000,
    maxActiveLeads: 12,
  },
  {
    name: "Malik Johnson",
    role: "agent",
    roleLabel: "Investor and resale specialist",
    areas: ["Houston", "Spring", "The Woodlands", "Conroe"],
    propertyTypes: ["single_family", "townhome", "investment"],
    leadTypes: ["buyer", "investor"],
    budgetMin: 180000,
    budgetMax: 800000,
    maxActiveLeads: 10,
  },
  {
    name: "Priya Shah",
    role: "agent",
    roleLabel: "Sugar Land buyer agent",
    areas: ["Sugar Land", "Missouri City", "Pearland"],
    propertyTypes: ["single_family", "townhome", "new_construction"],
    leadTypes: ["buyer", "seller"],
    budgetMin: 300000,
    budgetMax: 900000,
    maxActiveLeads: 11,
  },
];

const listingsSeed = [
  {
    key: "kb-katy-295",
    address: "27106 Talora Lake Dr, Katy, TX",
    price: 385000,
    beds: 3,
    baths: 2.5,
    area: "Katy / Sunterra",
    builder: "KB Home",
    status: "Active",
    mlsNumber: "HAR-27106",
    propertyType: "single family",
    squareFeet: 2140,
    yearBuilt: "2024",
    lot: "5,400 sqft",
    monthlyHoa: 95,
    annualTaxRate: 3.18,
    hasPool: false,
    neighborhood: "Sunterra",
    city: "Katy",
    state: "TX",
    postalCode: "77493",
    openHouse: "Saturday, 11 AM-2 PM",
    previousPrice: 405000,
    marketLabel: "price reduced this week",
    description: "Move-in-ready Katy new-construction option with a practical open kitchen, upstairs game room, and enough separation for kids or a home office. Sunterra gives buyers the lagoon-community draw while staying below the bigger Bridgeland and Fulshear price points.",
    features: ["$20k price cut", "shaded backyard", "upstairs game room", "covered patio", "tankless water heater", "Sunterra lagoon access", "FHA-friendly"],
    photoUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["FHA-friendly community", "Lagoon community draw", "Newer construction with room to grow"],
  },
  {
    key: "lennar-richmond-340",
    address: "5219 Prairie Terrace Ln, Richmond, TX",
    price: 412000,
    beds: 4,
    baths: 3,
    area: "Richmond / Arabella",
    builder: "Lennar",
    status: "Sold",
    mlsNumber: "HAR-5219",
    propertyType: "single family",
    squareFeet: 2550,
    yearBuilt: "2023",
    lot: "6,200 sqft",
    monthlyHoa: 83,
    annualTaxRate: 3.05,
    hasPool: false,
    neighborhood: "Arabella on the Prairie",
    city: "Richmond",
    state: "TX",
    postalCode: "77469",
    openHouse: null,
    marketLabel: "recently sold",
    description: "Recently sold Richmond family benchmark in Arabella on the Prairie. Useful for buyers comparing four-bedroom new-construction value, but Harwick should route interest toward available alternatives instead of promising a showing.",
    features: ["recently sold", "four-bedroom plan", "downstairs guest suite", "covered patio", "Arabella amenity center", "newer construction"],
    photoUrl: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["Recently sold example", "Good family-size benchmark", "Use as alternative-search entry point"],
  },
  {
    key: "perry-sugar-land-510",
    address: "4518 Orchard Chase Ct, Sugar Land, TX",
    price: 675000,
    beds: 4,
    baths: 3.5,
    area: "Sugar Land / Riverstone",
    builder: "Perry Homes",
    status: "verify",
    mlsNumber: "HAR-4518",
    propertyType: "single family",
    squareFeet: 3180,
    yearBuilt: "2022",
    lot: "7,800 sqft",
    monthlyHoa: 118,
    annualTaxRate: 2.78,
    hasPool: false,
    neighborhood: "Riverstone",
    city: "Sugar Land",
    state: "TX",
    postalCode: "77479",
    openHouse: "By appointment",
    previousPrice: 699000,
    marketLabel: "price reduced",
    description: "Riverstone family home with a larger floor plan, high ceilings, a dedicated study, and a shaded cul-de-sac lot. Good fit for buyers who ask about schools, commute to the Energy Corridor, or want Sugar Land without jumping into luxury pricing.",
    features: ["$24k price cut", "cul-de-sac lot", "dedicated study", "game room", "covered patio", "three-car tandem garage", "Riverstone schools demand"],
    photoUrl: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["Strong school-district demand", "Larger floorplan for family buyers", "Verify current availability before promising a tour"],
  },
  {
    key: "woodlands-townhome-420",
    address: "24 Waterway Bend Pl, The Woodlands, TX",
    price: 525000,
    beds: 3,
    baths: 2.5,
    area: "The Woodlands / Hughes Landing",
    builder: "Resale",
    status: "Active",
    mlsNumber: "HAR-24WB",
    propertyType: "townhome",
    squareFeet: 2015,
    yearBuilt: "2019",
    lot: "2,200 sqft",
    monthlyHoa: 245,
    annualTaxRate: 2.21,
    hasPool: false,
    neighborhood: "Hughes Landing",
    city: "The Woodlands",
    state: "TX",
    postalCode: "77380",
    openHouse: "Sunday, 1-3 PM",
    marketLabel: "open house this weekend",
    description: "Low-maintenance Woodlands townhome close to Hughes Landing restaurants, trails, and office corridors. Better for a buyer who wants walkability and a lock-and-leave feel than a large yard.",
    features: ["open house Sunday", "walkable to Hughes Landing", "low-maintenance", "balcony", "two-car garage", "trails nearby"],
    photoUrl: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600210492493-0946911123ea?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["Walkable to Hughes Landing", "Low-maintenance townhome", "HOA details should be confirmed"],
  },
  {
    key: "heights-728",
    address: "728 W 23rd St, Houston, TX",
    price: 899000,
    beds: 4,
    baths: 3.5,
    area: "Houston Heights",
    builder: "Resale",
    status: "Active",
    mlsNumber: "HAR-72823",
    propertyType: "single family",
    squareFeet: 2860,
    yearBuilt: "2020",
    lot: "3,600 sqft",
    monthlyHoa: 0,
    annualTaxRate: 2.16,
    hasPool: false,
    neighborhood: "Houston Heights",
    city: "Houston",
    state: "TX",
    postalCode: "77008",
    openHouse: "Saturday, 12-2 PM",
    previousPrice: 925000,
    marketLabel: "price reduced",
    description: "Houston Heights single-family home with city access, a private driveway, and a small shaded yard without HOA overhead. This is the urban option for buyers who want restaurants, commute convenience, and a real home instead of a condo.",
    features: ["$26k price cut", "private driveway", "no HOA", "shaded side yard", "walkable Heights location", "first-floor guest suite"],
    photoUrl: "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600566752229-250ed79470f8?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600566752734-0f0b7a0e160f?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["Walkable Heights location", "No HOA", "Good fit for buyers who want city access without a condo"],
  },
  {
    key: "cypress-bridgeland-625",
    address: "18611 Parkland Crossing Dr, Cypress, TX",
    price: 625000,
    beds: 5,
    baths: 4,
    area: "Cypress / Bridgeland",
    builder: "Highland Homes",
    status: "Active",
    mlsNumber: "HAR-18611",
    propertyType: "single family",
    squareFeet: 3425,
    yearBuilt: "2021",
    lot: "8,100 sqft",
    monthlyHoa: 123,
    annualTaxRate: 3.11,
    hasPool: false,
    neighborhood: "Bridgeland",
    city: "Cypress",
    state: "TX",
    postalCode: "77433",
    openHouse: "Sunday, 12-3 PM",
    marketLabel: "new this week",
    description: "Five-bedroom Bridgeland home with a two-story family room, media room, and enough bedroom separation for multi-kid households. Strong test listing for school, commute, and master-planned-community conversations.",
    features: ["new this week", "five bedrooms", "media room", "two-story family room", "large backyard", "Bridgeland amenities", "high school zoning question"],
    photoUrl: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600566752447-f4c9f32bfa67?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600607688066-890987f18a86?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["Five-bedroom family option", "Master-planned community amenities", "Good school-conversation test case"],
  },
  {
    key: "pearland-southlake-455",
    address: "3320 Southlake Dr, Pearland, TX",
    price: 455000,
    beds: 4,
    baths: 3,
    area: "Pearland / Southlake",
    builder: "Resale",
    status: "Active",
    mlsNumber: "HAR-3320",
    propertyType: "single family",
    squareFeet: 2685,
    yearBuilt: "2018",
    lot: "6,900 sqft",
    monthlyHoa: 76,
    annualTaxRate: 2.89,
    hasPool: false,
    neighborhood: "Southlake",
    city: "Pearland",
    state: "TX",
    postalCode: "77584",
    openHouse: null,
    previousPrice: 469000,
    marketLabel: "price reduced this week",
    description: "Pearland four-bedroom with a flexible dining/study space, covered patio, and fast access toward 288. Strong value conversation for buyers who want Houston access, more space, and a price point under many west-side master-planned homes.",
    features: ["$14k price cut", "covered patio", "flex study", "south Houston commute", "four bedrooms under $500k", "community lake"],
    photoUrl: "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600566752547-33f5c2b63eea?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["South of Houston commuter option", "Four-bedroom plan", "Good fit for buyers asking about schools and commute"],
  },
  {
    key: "spring-creekside-575",
    address: "11803 Creekside Green Dr, Spring, TX",
    price: 575000,
    beds: 4,
    baths: 3.5,
    area: "Spring / Creekside",
    builder: "Resale",
    status: "Pending",
    mlsNumber: "HAR-11803",
    propertyType: "single family",
    squareFeet: 3050,
    yearBuilt: "2017",
    lot: "7,200 sqft",
    monthlyHoa: 105,
    annualTaxRate: 2.74,
    hasPool: true,
    neighborhood: "Creekside Park",
    city: "Spring",
    state: "TX",
    postalCode: "77389",
    openHouse: null,
    marketLabel: "pending",
    description: "Pending Creekside Park pool home with a family-friendly layout, outdoor kitchen, and strong Woodlands-area lifestyle pull. Harwick should be clear that this one is pending and use it to discover whether pool, schools, or location mattered most.",
    features: ["pending", "pool", "outdoor kitchen", "Creekside Park", "game room", "covered patio", "near trails"],
    photoUrl: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600607687644-c7171b42498b?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["Pending listing", "Pool and family layout", "Use to test pending-to-alternative flow"],
  },
  {
    key: "fulshear-cross-creek-735",
    address: "30018 Violet Sky Way, Fulshear, TX",
    price: 735000,
    beds: 5,
    baths: 4.5,
    area: "Fulshear / Cross Creek Ranch",
    builder: "Newmark Homes",
    status: "Active",
    mlsNumber: "HAR-30018",
    propertyType: "single family",
    squareFeet: 3860,
    yearBuilt: "2024",
    lot: "9,000 sqft",
    monthlyHoa: 130,
    annualTaxRate: 3.02,
    hasPool: false,
    neighborhood: "Cross Creek Ranch",
    city: "Fulshear",
    state: "TX",
    postalCode: "77441",
    openHouse: "Private tours this weekend",
    marketLabel: "new this week",
    description: "Large Fulshear new-construction home with a guest suite, media room, and oversized lot in Cross Creek Ranch. Good fit for extended-family, work-from-home, and school-zone conversations.",
    features: ["new this week", "guest suite", "media room", "oversized lot", "three-car garage", "Cross Creek Ranch", "builder incentives available"],
    photoUrl: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["Large new-construction option", "Good for extended-family questions", "Master-planned amenities"],
  },
  {
    key: "missouri-city-sienna-498",
    address: "9019 Sienna Ranch Rd, Missouri City, TX",
    price: 498000,
    beds: 4,
    baths: 3,
    area: "Missouri City / Sienna",
    builder: "Resale",
    status: "Active",
    mlsNumber: "HAR-9019",
    propertyType: "single family",
    squareFeet: 2795,
    yearBuilt: "2020",
    lot: "6,750 sqft",
    monthlyHoa: 102,
    annualTaxRate: 2.93,
    hasPool: false,
    neighborhood: "Sienna",
    city: "Missouri City",
    state: "TX",
    postalCode: "77459",
    openHouse: "Saturday, 2-4 PM",
    previousPrice: 515000,
    marketLabel: "price reduced",
    description: "Sienna four-bedroom with a practical one-story layout, covered patio, and quick access to neighborhood amenities. Strong choice for buyers who want Missouri City schools, master-planned amenities, and a sub-$500k target.",
    features: ["$17k price cut", "one-story layout", "covered patio", "Sienna amenities", "under $500k", "split bedrooms"],
    photoUrl: "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1400&q=88",
    mediaUrls: [
      "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1400&q=88",
      "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1200&q=86",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=86",
    ],
    facts: ["Family-friendly master-planned area", "Four-bedroom under $500k test case", "Good for commute and school questions"],
  },
];

const personaSeed = [
  {
    key: "marcus-webb",
    name: "Marcus Webb",
    username: "marcuswebb_htx",
    channel: "instagram_dm",
    source: "Instagram DM after KB Home Katy reel",
    opening: "hey is this still available how much do i need to put down",
    manualReply: "Hi! Yes it may be. Down payment depends on loan type. Call me at 832-763-7017.",
    expectedReply: "Hey Marcus, good timing on that KB Home community. Down payment depends on loan type, and FHA can be as low as 3.5% before closing costs. Are you already working with a lender, or would it help if I connected you with one?",
    leadType: "buyer",
    intent: "high",
    status: "engaged",
    budgetMin: 280000,
    budgetMax: 310000,
    financingStatus: "needs_lender",
    timeline: "3-4 months",
    area: "Katy",
    score: 72,
    hoursAgo: 8,
    listingKey: "kb-katy-295",
    assigned: "Tiana Brooks",
    fub: "queued",
    reviewMode: "ai_on",
  },
  {
    key: "danielle-reece",
    name: "Danielle Reece",
    username: "dani_reece",
    channel: "instagram_comment",
    source: "Comment on Lennar Richmond reel",
    opening: "price?",
    manualReply: "DM me.",
    expectedReply: "I can send the latest pricing in DM. This Richmond Lennar community has had plans around the mid $300s, but I want to verify the exact home before quoting it. Are you looking in Richmond only or nearby Katy/Fulshear too?",
    leadType: "buyer",
    intent: "medium",
    status: "new",
    budgetMin: 320000,
    budgetMax: 380000,
    financingStatus: "unknown",
    timeline: "6+ months",
    area: "Richmond",
    score: 54,
    hoursAgo: 2,
    listingKey: "lennar-richmond-340",
    assigned: null,
    fub: "skipped",
    reviewMode: "ai_on",
  },
  {
    key: "brandon-ellis",
    name: "Brandon Ellis",
    username: "brandoneinvests",
    channel: "instagram_dm",
    source: "Instagram DM after investor story",
    opening: "need something under 250k that rents well. can close cash if numbers make sense",
    manualReply: "Send me your criteria.",
    expectedReply: "Got it, Brandon. Cash helps. Under $250k with strong rent usually needs tighter area and condition filters here. Are you focused on northwest Houston/Spring, or are you open to south side too if the numbers are better?",
    leadType: "investor",
    intent: "high",
    status: "qualified",
    budgetMin: 180000,
    budgetMax: 250000,
    financingStatus: "cash",
    timeline: "30 days",
    area: "Houston",
    score: 84,
    hoursAgo: 18,
    listingKey: null,
    assigned: "Malik Johnson",
    fub: "synced",
    reviewMode: "ai_on",
  },
  {
    key: "keisha-turner",
    name: "Keisha Turner",
    username: "keisha_t",
    channel: "instagram_dm",
    source: "Late-night DM after first-time buyer post",
    opening: "i want to buy but my credit like 620 can i still get something",
    manualReply: "You need to talk to a lender first.",
    expectedReply: "Keisha, you may still have options, but a lender should confirm what is realistic before we shop homes. FHA can work for some buyers depending on the full file. Want me to connect you with a lender who can tell you what range makes sense?",
    leadType: "buyer",
    intent: "medium",
    status: "engaged",
    budgetMin: 240000,
    budgetMax: 300000,
    financingStatus: "needs_lender",
    timeline: "4-6 months",
    area: "Cypress",
    score: 61,
    hoursAgo: 11,
    listingKey: null,
    assigned: "Ademola",
    fub: "queued",
    reviewMode: "paused_by_rule",
  },
  {
    key: "sophia-nguyen",
    name: "Sophia Nguyen",
    username: "sophianguyen",
    channel: "facebook_dm",
    source: "Facebook DM about Sugar Land new construction",
    opening: "Can we tour the Perry home this Saturday afternoon?",
    manualReply: "What time?",
    expectedReply: "Saturday could work, Sophia. Before I request the showing, are you already pre-approved and is Sugar Land your main target area? I can then send the best available window for that Perry home.",
    leadType: "buyer",
    intent: "high",
    status: "hot",
    budgetMin: 480000,
    budgetMax: 560000,
    financingStatus: "preapproved",
    timeline: "0-30 days",
    area: "Sugar Land",
    score: 91,
    hoursAgo: 4,
    listingKey: "perry-sugar-land-510",
    assigned: "Priya Shah",
    fub: "queued",
    reviewMode: "ai_on",
    taskType: "request_showing_approval",
  },
  {
    key: "omar-banks",
    name: "Omar Banks",
    username: "omar_banks",
    channel: "instagram_dm",
    source: "DM after down-payment assistance post",
    opening: "do yall help with down payment programs",
    manualReply: "Yes.",
    expectedReply: "Yes, Omar. Some buyers qualify for assistance, but the details depend on income, loan type, and the city or county program. Are you buying in Houston proper or a suburb like Katy, Cypress, or Sugar Land?",
    leadType: "buyer",
    intent: "medium",
    status: "nurture",
    budgetMin: 220000,
    budgetMax: 285000,
    financingStatus: "needs_lender",
    timeline: "6+ months",
    area: "Houston",
    score: 52,
    hoursAgo: 26,
    listingKey: null,
    assigned: null,
    fub: "failed",
    reviewMode: "ai_on",
  },
  {
    key: "alyssa-carter",
    name: "Alyssa Carter",
    username: "alyssa_carter",
    channel: "instagram_comment",
    source: "Comment on open-house post",
    opening: "is this open house still happening sunday?",
    manualReply: "Yes Sunday.",
    expectedReply: "Yes, Sunday is still the plan. I can send the address and reminder in DM. Are you coming just to browse, or are you actively shopping in that area?",
    leadType: "buyer",
    intent: "medium",
    status: "engaged",
    budgetMin: 350000,
    budgetMax: 430000,
    financingStatus: "unknown",
    timeline: "2-3 months",
    area: "The Woodlands",
    score: 64,
    hoursAgo: 5,
    listingKey: "woodlands-townhome-420",
    assigned: "Malik Johnson",
    fub: "queued",
    reviewMode: "ai_on",
    taskType: "open_house_registration",
  },
  {
    key: "robert-hill",
    name: "Robert Hill",
    username: "robert_hill",
    channel: "instagram_dm",
    source: "Seller valuation DM",
    opening: "how much can i get for my house in Missouri City",
    manualReply: "Send address.",
    expectedReply: "I can help you get a realistic range, Robert. I would need the neighborhood, bed/bath count, condition, and any upgrades first. If you want, send the address and I can have the team prepare a proper valuation instead of guessing.",
    leadType: "seller",
    intent: "high",
    status: "engaged",
    budgetMin: null,
    budgetMax: null,
    financingStatus: "unknown",
    timeline: "60-90 days",
    area: "Missouri City",
    score: 76,
    hoursAgo: 30,
    listingKey: null,
    assigned: "Priya Shah",
    fub: "queued",
    reviewMode: "ai_on",
  },
  {
    key: "jasmine-cole",
    name: "Jasmine Cole",
    username: "jasminecole",
    channel: "instagram_dm",
    source: "DM after rent-vs-buy post",
    opening: "just looking rn not ready until next year",
    manualReply: "Ok let me know when ready.",
    expectedReply: "That is totally fine, Jasmine. If next year is the goal, the best move now is getting your budget and credit plan clear so you are not rushed later. What area would you want to be in when you do start shopping?",
    leadType: "buyer",
    intent: "low",
    status: "nurture",
    budgetMin: 260000,
    budgetMax: 330000,
    financingStatus: "unknown",
    timeline: "12 months",
    area: "Pearland",
    score: 38,
    hoursAgo: 44,
    listingKey: null,
    assigned: null,
    fub: "skipped",
    reviewMode: "ai_on",
  },
  {
    key: "eric-mason",
    name: "Eric Mason",
    username: "ericmason",
    channel: "facebook_comment",
    source: "Comment on Perry Homes photo carousel",
    opening: "hoa?",
    manualReply: "It depends.",
    expectedReply: "HOA depends on the exact section and home, so I would want to verify it before giving you a number. Are you looking at this Perry community specifically, or comparing Sugar Land options?",
    leadType: "buyer",
    intent: "medium",
    status: "new",
    budgetMin: 475000,
    budgetMax: 575000,
    financingStatus: "preapproved",
    timeline: "60 days",
    area: "Sugar Land",
    score: 67,
    hoursAgo: 7,
    listingKey: "perry-sugar-land-510",
    assigned: "Priya Shah",
    fub: "failed",
    reviewMode: "ai_on",
  },
  {
    key: "natalie-price",
    name: "Natalie Price",
    username: "nataliep",
    channel: "instagram_dm",
    source: "DM from relocation reel",
    opening: "moving from atlanta in july need schools and newer homes",
    manualReply: "Katy and Sugar Land are good.",
    expectedReply: "Katy and Sugar Land are both strong places to compare for newer homes and schools, Natalie. July gives us enough time to plan. Are you already pre-approved, and what price range should I keep you under?",
    leadType: "buyer",
    intent: "high",
    status: "hot",
    budgetMin: 420000,
    budgetMax: 600000,
    financingStatus: "preapproved",
    timeline: "3-4 months",
    area: "Katy",
    score: 88,
    hoursAgo: 13,
    listingKey: null,
    assigned: "Ademola",
    fub: "synced",
    reviewMode: "ai_on",
  },
  {
    key: "ghost-lead",
    name: "Trevor Miles",
    username: "trevor_m",
    channel: "instagram_dm",
    source: "DM after new construction reel",
    opening: "info",
    manualReply: "What info do you need?",
    expectedReply: "I can help. Are you asking about price, monthly payment, availability, or touring the home?",
    leadType: "unknown",
    intent: "low",
    status: "new",
    budgetMin: null,
    budgetMax: null,
    financingStatus: "unknown",
    timeline: null,
    area: "Katy",
    score: 22,
    hoursAgo: 72,
    listingKey: "kb-katy-295",
    assigned: null,
    fub: "skipped",
    reviewMode: "ai_on",
  },
];

async function seedTeam(supabase, workspace, ownerUser) {
  const ownerMember = await upsertMember(supabase, workspace.id, ownerUser, teamSeed[0]);
  const members = new Map([[teamSeed[0].name, ownerMember]]);
  for (const memberSeed of teamSeed.slice(1)) {
    const user = await ensureSyntheticUser(supabase, memberSeed.name);
    const member = await upsertMember(supabase, workspace.id, user, memberSeed);
    members.set(memberSeed.name, member);
  }

  for (const memberSeed of teamSeed) {
    const member = members.get(memberSeed.name);
    const { error } = await supabase
      .from("member_routing_profiles")
      .upsert({
        workspace_id: workspace.id,
        member_id: member.id,
        role_label: memberSeed.roleLabel,
        areas: memberSeed.areas,
        property_types: memberSeed.propertyTypes,
        lead_types: memberSeed.leadTypes,
        budget_min: memberSeed.budgetMin,
        budget_max: memberSeed.budgetMax,
        max_active_leads: memberSeed.maxActiveLeads,
        accepts_new_leads: memberSeed.name !== "Ademola",
        notification_preference: "app",
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,member_id" });
    if (error !== null) throw error;
  }

  return members;
}

async function upsertMember(supabase, workspaceId, user, seed) {
  const { data, error } = await supabase
    .from("workspace_members")
    .upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: seed.role,
      role_label: seed.roleLabel,
      display_name: seed.name,
      email: user.email,
      is_active: true,
      presence_status: seed.name === "Ademola" ? "in_call" : "online",
      presence_last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,user_id" })
    .select("*")
    .single();
  if (error !== null) throw error;
  return data;
}

async function seedIntegrationAccounts(supabase, workspaceId) {
  const rows = [
    {
      workspace_id: workspaceId,
      provider: "meta",
      status: "connected",
      provider_account_id: `${SYNTHETIC_PREFIX}:meta-account`,
      provider_account_name: "Views of TX Realty Instagram",
      encrypted_credential_ref: null,
      connected_at: new Date().toISOString(),
      account_scope: "workspace",
      provider_account_ids: [`${SYNTHETIC_PREFIX}:ig`, `${SYNTHETIC_PREFIX}:page`],
      updated_at: new Date().toISOString(),
    },
    {
      workspace_id: workspaceId,
      provider: "follow_up_boss",
      status: "connected",
      provider_account_id: `${SYNTHETIC_PREFIX}:fub`,
      provider_account_name: "Views of TX Realty FUB sandbox",
      encrypted_credential_ref: null,
      connected_at: new Date().toISOString(),
      account_scope: "workspace",
      provider_account_ids: [`${SYNTHETIC_PREFIX}:fub`],
      updated_at: new Date().toISOString(),
    },
  ];
  const results = [];
  for (const row of rows) {
    const { data: existing, error: findError } = await supabase
      .from("integration_accounts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("provider", row.provider)
      .eq("provider_account_id", row.provider_account_id)
      .maybeSingle();
    if (findError !== null) throw findError;
    const query = existing === null
      ? supabase.from("integration_accounts").insert(row).select("*").single()
      : supabase.from("integration_accounts").update(row).eq("id", existing.id).select("*").single();
    const { data, error } = await query;
    if (error !== null) throw error;
    results.push(data);
  }
  return results;
}

async function seedListings(supabase, workspaceId) {
  const listingRows = [];
  for (const listing of listingsSeed) {
    const row = {
      workspace_id: workspaceId,
      external_listing_id: `${SYNTHETIC_PREFIX}:listing:${listing.key}`,
      source: "manual",
      address: listing.address,
      price: listing.price,
      beds: listing.beds,
      baths: listing.baths,
      has_pool: listing.hasPool ?? false,
      status: listing.status,
      verification_status: listing.status === "verify" ? "needs_recheck" : "verified",
      raw_facts: {
        syntheticSeed: SYNTHETIC_PREFIX,
        builder: listing.builder,
        area: listing.area,
        city: listing.city,
        state: listing.state,
        postalCode: listing.postalCode,
        neighborhood: listing.neighborhood,
        propertyType: listing.propertyType,
        squareFeet: listing.squareFeet,
        yearBuilt: listing.yearBuilt,
        lot: listing.lot,
        monthlyHoa: listing.monthlyHoa,
        annualTaxRate: listing.annualTaxRate,
        openHouse: listing.openHouse,
        description: listing.description,
        features: listing.features,
        marketLabel: listing.marketLabel,
        previousPrice: listing.previousPrice ?? null,
        priceCutAmount: listing.previousPrice !== undefined && listing.previousPrice !== null && listing.previousPrice > listing.price
          ? listing.previousPrice - listing.price
          : null,
        priceChange: listing.previousPrice !== undefined && listing.previousPrice !== null && listing.previousPrice > listing.price ? "reduced" : null,
        photoUrl: listing.photoUrl,
        mediaUrls: listing.mediaUrls,
        agentName: listing.agentName ?? "Prestige Realty",
        facts: listing.facts,
        demoUse: "Houston brokerage synthetic rehearsal",
      },
      mls_number: listing.mlsNumber,
      embedding_text: `${listing.address}. ${listing.area}. ${listing.neighborhood}. ${listing.propertyType}. ${listing.builder}. ${listing.description}. ${(listing.features ?? []).join(" ")} ${listing.facts.join(" ")}`,
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: findError } = await supabase
      .from("listing_facts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("external_listing_id", row.external_listing_id)
      .maybeSingle();
    if (findError !== null) throw findError;
    const query = existing === null
      ? supabase.from("listing_facts").insert(row).select("*").single()
      : supabase.from("listing_facts").update(row).eq("id", existing.id).select("*").single();
    const { data, error } = await query;
    if (error !== null) throw error;
    listingRows.push(data);
  }
  return new Map(listingRows.map((listing) => [listing.external_listing_id.replace(`${SYNTHETIC_PREFIX}:listing:`, ""), listing]));
}

async function seedSocialPosts(supabase, workspaceId) {
  const rows = listingsSeed.map((listing) => ({
    workspace_id: workspaceId,
    provider: "meta",
    provider_account_id: `${SYNTHETIC_PREFIX}:meta-account`,
    source_channel: "instagram_comment",
    source_post_id: `${SYNTHETIC_PREFIX}:post:${listing.key}`,
    caption: `${listing.builder} options in ${listing.area}. DM us for current incentives and showing windows.`,
    cta_label: "DM for details",
    media_type: "carousel_album",
    permalink: null,
    areas_mentioned: [listing.area],
    listing_hints: listing.facts,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("social_posts").upsert(rows, { onConflict: "workspace_id,provider,source_post_id" });
  if (error !== null) throw error;
}

async function seedLeadsAndQueues(supabase, workspace, members, listingByKey, options, aiRuntimeDeps) {
  let leadCount = 0;
  let reviewCount = 0;
  let generatedDraftCount = 0;
  let voiceCount = 0;
  let fubLogCount = 0;

  for (const persona of personaSeed) {
    const assignedMember = persona.assigned === null ? null : members.get(persona.assigned) ?? null;
    const listing = persona.listingKey === null ? null : listingByKey.get(persona.listingKey) ?? null;
    const lastMessageAt = hoursAgo(persona.hoursAgo);
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        workspace_id: workspace.id,
        status: persona.status,
        source_channel: persona.channel,
        source_provider_id: `${SYNTHETIC_PREFIX}:lead:${persona.key}`,
        source_post_id: listing === null ? null : `${SYNTHETIC_PREFIX}:post:${persona.listingKey}`,
        source_comment_id: persona.channel.endsWith("_comment") ? `${SYNTHETIC_PREFIX}:comment:${persona.key}` : null,
        instagram_user_id: `${SYNTHETIC_PREFIX}:user:${persona.key}`,
        instagram_username: persona.username,
        full_name: persona.name,
        phone: null,
        email: null,
        lead_type: persona.leadType,
        intent: persona.intent,
        timeline: persona.timeline,
        budget_min: persona.budgetMin,
        budget_max: persona.budgetMax,
        target_area: persona.area,
        financing_status: persona.financingStatus,
        score: persona.score,
        assigned_agent_id: assignedMember?.id ?? null,
        follow_up_boss_contact_id: persona.fub === "synced" ? `${SYNTHETIC_PREFIX}:fub-contact:${persona.key}` : null,
        last_message_at: lastMessageAt,
        next_followup_at: persona.status === "nurture" ? daysFromNow(3) : null,
        created_at: lastMessageAt,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (leadError !== null) throw leadError;
    leadCount += 1;

    const { data: event, error: eventError } = await supabase
      .from("lead_events")
      .upsert({
        workspace_id: workspace.id,
        lead_id: lead.id,
        provider: "meta",
        event_type: persona.channel.endsWith("_comment") ? "comment_received" : "message_received",
        source_channel: persona.channel,
        provider_event_id: `${SYNTHETIC_PREFIX}:event:${persona.key}:inbound`,
        provider_account_id: `${SYNTHETIC_PREFIX}:meta-account`,
        provider_user_id: `${SYNTHETIC_PREFIX}:user:${persona.key}`,
        source_post_id: listing === null ? null : `${SYNTHETIC_PREFIX}:post:${persona.listingKey}`,
        source_comment_id: persona.channel.endsWith("_comment") ? `${SYNTHETIC_PREFIX}:comment:${persona.key}` : null,
        text: persona.opening,
        occurred_at: lastMessageAt,
      }, { onConflict: "workspace_id,provider,provider_event_id" })
      .select("*")
      .single();
    if (eventError !== null) throw eventError;

    await insertConversationMessages(supabase, workspace.id, lead.id, persona, lastMessageAt);

    const { data: review, error: reviewError } = await supabase
      .from("social_reply_reviews")
      .upsert({
        workspace_id: workspace.id,
        lead_id: lead.id,
        lead_event_id: event.id,
        provider_account_id: `${SYNTHETIC_PREFIX}:meta-account`,
        recipient_user_id: `${SYNTHETIC_PREFIX}:user:${persona.key}`,
        channel: persona.channel,
        source_post_id: listing === null ? null : `${SYNTHETIC_PREFIX}:post:${persona.listingKey}`,
        source_comment_id: persona.channel.endsWith("_comment") ? `${SYNTHETIC_PREFIX}:comment:${persona.key}` : null,
        inbound_text: persona.opening,
        suggested_reply: null,
        status: "pending",
        automation_mode: persona.reviewMode,
        automation_reason: persona.reviewMode === "paused_by_rule"
          ? "Synthetic risky lending language: Harwick should draft but leave human review clear."
          : "Synthetic rehearsal: safe qualification reply can be evaluated by Harwick policy.",
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,lead_event_id" })
      .select("*")
      .single();
    if (reviewError !== null) throw reviewError;
    reviewCount += 1;

    if (options.generateAiDrafts) {
      const didGenerate = await generateAndPersistAiDraft({
        supabase,
        workspace,
        lead,
        review,
        persona,
        listing,
        aiRuntimeDeps,
        enqueueAutoSendJobs: options.enqueueAutoSendJobs,
      });
      if (didGenerate) generatedDraftCount += 1;
    }

    if (persona.taskType !== undefined) {
      const { error } = await supabase.from("lead_tasks").insert({
        workspace_id: workspace.id,
        lead_id: lead.id,
        listing_id: listing?.id ?? null,
        assigned_member_id: assignedMember?.id ?? null,
        task_type: persona.taskType,
        priority: persona.score > 80 ? "urgent" : "high",
        status: "open",
        title: persona.taskType === "request_showing_approval" ? `Approve showing for ${persona.name}` : `Review open-house intent for ${persona.name}`,
        description: `${persona.source}. Lead said: ${persona.opening}`,
        due_at: daysFromNow(1),
      });
      if (error !== null) throw error;
    }

    if (persona.fub !== "skipped") {
      const { error } = await supabase.from("crm_sync_logs").insert({
        workspace_id: workspace.id,
        lead_id: lead.id,
        provider: "follow_up_boss",
        status: persona.fub,
        provider_contact_id: persona.fub === "synced" ? `${SYNTHETIC_PREFIX}:fub-contact:${persona.key}` : null,
        attempt_count: persona.fub === "failed" ? 2 : 0,
        last_error_code: persona.fub === "failed" ? "synthetic_missing_stage_mapping" : null,
        last_error_message: persona.fub === "failed" ? "Synthetic FUB stage label did not map cleanly." : null,
        next_retry_at: persona.fub === "failed" ? daysFromNow(0, 1) : null,
      });
      if (error !== null) throw error;
      fubLogCount += 1;
    }
  }

  const voiceLeads = personaSeed.filter((persona) => persona.score >= 60).slice(0, 4);
  for (const persona of voiceLeads) {
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace.id)
      .eq("source_provider_id", `${SYNTHETIC_PREFIX}:lead:${persona.key}`)
      .single();
    const { error } = await supabase.from("voice_lead_handoffs").insert({
      workspace_id: workspace.id,
      lead_id: lead.id,
      call_id: `${SYNTHETIC_PREFIX}:retell-call:${persona.key}`,
      phone: `+1832${String(7000000 + voiceCount).padStart(7, "0")}`,
      caller_name: persona.name,
      urgency: persona.score > 80 ? "hot" : "needs_handoff",
      summary: `${persona.name} called about ${persona.area ?? "Houston"} after the social thread. ${persona.timeline ?? "Timeline unknown"}; financing ${persona.financingStatus}. Recommended next step: ${persona.financingStatus === "needs_lender" ? "lender referral" : "showing or agent follow-up"}.`,
      status: "captured",
      review_status: "pending",
      budget: persona.budgetMin === null ? null : `$${persona.budgetMin.toLocaleString()}-${persona.budgetMax?.toLocaleString() ?? "unknown"}`,
      target_area: persona.area,
      timeline: persona.timeline,
      financing_status: persona.financingStatus,
      lead_type: persona.leadType,
    });
    if (error !== null) throw error;
    voiceCount += 1;
  }

  return { leadCount, reviewCount, generatedDraftCount, voiceCount, fubLogCount };
}

async function insertConversationMessages(supabase, workspaceId, leadId, persona, inboundAt) {
  const inboundDate = new Date(inboundAt);
  const manualDate = new Date(inboundDate.getTime() + 4 * 60 * 60 * 1000);
  const rows = [
    {
      workspace_id: workspaceId,
      lead_id: leadId,
      sender_type: "customer",
      sender_id: `${SYNTHETIC_PREFIX}:user:${persona.key}`,
      body: persona.opening,
      source_channel: persona.channel,
      provider_message_id: `${SYNTHETIC_PREFIX}:msg:${persona.key}:inbound`,
      status: "sent",
      created_at: inboundDate.toISOString(),
    },
    {
      workspace_id: workspaceId,
      lead_id: leadId,
      sender_type: "operator",
      sender_id: "manual-before",
      body: `[manual-before comparison, ${persona.source}] ${persona.manualReply}`,
      source_channel: persona.channel,
      provider_message_id: `${SYNTHETIC_PREFIX}:msg:${persona.key}:manual-before`,
      status: "sent",
      created_at: manualDate.toISOString(),
    },
  ];
  const { error } = await supabase.from("conversation_messages").insert(rows);
  if (error !== null) throw error;
}

async function loadAiRuntimeDeps(envValues) {
  try {
    const [{ createLocalHarwickAiRuntime, createOpenAIHarwickAiRuntime }, { evaluateHarwickAiAutomation }] = await Promise.all([
      import("@realty-ops/integrations"),
      import("@realty-ops/core"),
    ]);
    const apiKey = envValues.get("OPENAI_API_KEY");
    const model = envValues.get("OPENAI_REPLY_MODEL") ?? "gpt-4o-mini";
    return {
      runtime: apiKey === undefined || apiKey.trim().length === 0
        ? createLocalHarwickAiRuntime()
        : createOpenAIHarwickAiRuntime({ apiKey, model }),
      fallbackRuntime: createLocalHarwickAiRuntime(),
      engine: apiKey === undefined || apiKey.trim().length === 0 ? "local" : "openai",
      evaluateHarwickAiAutomation,
    };
  } catch (error) {
    throw new Error(`Unable to load built Harwick runtime packages. Run npm run build:packages first. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function generateAndPersistAiDraft(params) {
  const { supabase, workspace, lead, review, persona, listing, aiRuntimeDeps, enqueueAutoSendJobs } = params;
  const runtimeInput = {
    workspaceName: workspace.name,
    channel: persona.channel,
    inboundText: persona.opening,
    conversation: [
      {
        id: `${persona.key}:inbound`,
        actor: "lead",
        body: persona.opening,
        occurredAt: new Date(lead.last_message_at).toISOString(),
      },
    ],
    state: {
      workspaceId: workspace.id,
      leadId: lead.id,
      providerThreadId: `${SYNTHETIC_PREFIX}:user:${persona.key}`,
      channel: persona.channel,
      automationMode: persona.reviewMode,
      currentIntent: "qualification_in_progress",
      qualification: {
        name: persona.name,
        phone: null,
        email: null,
        leadType: persona.leadType,
        intent: "unknown",
        timeline: persona.timeline,
        budget: persona.budgetMax,
        targetArea: persona.area,
        propertyType: listing === null ? null : "new_construction",
        financingStatus: persona.financingStatus,
        score: persona.score,
      },
      knownFacts: [persona.source, `Synthetic expected state: ${persona.status}`],
      lastAiAction: null,
      assignedAgentName: null,
      sourceOwnerName: "Ademola",
    },
    toneProfile: {
      name: "Views of TX Realty",
      voice: "warm, concise, Houston-specific, professional, never pushy",
      bannedPhrases: ["guaranteed", "definitely approved"],
      preferredPhrases: ["I can verify that", "what timeline are you working with"],
      emojiPolicy: "none",
      signature: null,
    },
    postContext: listing === null ? null : {
      caption: `${listing.address} synthetic social post`,
      ctaLabel: "DM for details",
      areasMentioned: [persona.area].filter(Boolean),
      listingHints: Array.isArray(listing.raw_facts?.facts) ? listing.raw_facts.facts : [],
      permalink: null,
      visualDescription: null,
    },
    listingContext: listing === null ? null : {
      listingId: listing.id,
      label: listing.address,
      address: listing.address,
      price: listing.price === null ? null : `$${Number(listing.price).toLocaleString()}`,
      status: listing.status,
      beds: listing.beds === null ? null : String(listing.beds),
      baths: listing.baths === null ? null : String(listing.baths),
      area: persona.area,
      facts: Array.isArray(listing.raw_facts?.facts) ? listing.raw_facts.facts : [],
      lastVerifiedAt: listing.verified_at,
    },
    calendarContext: [],
    buyerBlueprintUrl: null,
    policyNarrative: workspace.policy_narrative,
    leadDocument: `${persona.name} came from ${persona.source}. Budget ${persona.budgetMin ?? "unknown"}-${persona.budgetMax ?? "unknown"}. Financing ${persona.financingStatus}. Timeline ${persona.timeline ?? "unknown"}.`,
    workspaceMemory: "Ademola's audience is first-time Houston buyers. Ask one useful qualifying question and avoid pressure.",
  };

  let engine = aiRuntimeDeps.engine;
  let turn;
  try {
    turn = await aiRuntimeDeps.runtime.runTurn(runtimeInput);
  } catch (error) {
    console.warn(`[synthetic-seed] Harwick ${engine} runtime failed for ${persona.key}; falling back to local runtime: ${error instanceof Error ? error.message : String(error)}`);
    turn = await aiRuntimeDeps.fallbackRuntime.runTurn(runtimeInput);
    engine = "local_fallback";
  }
  const policy = {
    workspaceId: workspace.id,
    memberId: null,
    leadId: lead.id,
    scope: "conversation",
    automationMode: persona.reviewMode,
    autoSendEnabled: true,
  };
  const automationDecision = aiRuntimeDeps.evaluateHarwickAiAutomation({ turn, policy });
  const status = automationDecision.canAutoExecute ? "drafted" : "queued_for_approval";

  const { data: turnRow, error: turnError } = await supabase
    .from("harwick_ai_turns")
    .insert({
      workspace_id: workspace.id,
      lead_id: lead.id,
      social_reply_review_id: review.id,
      provider_thread_id: `${SYNTHETIC_PREFIX}:user:${persona.key}`,
      channel: persona.channel,
      runtime_input: runtimeInput,
      turn,
      automation_policy: policy,
      automation_decision: automationDecision,
      status,
      confidence: turn.confidence,
      next_action: turn.nextAction,
      reply: turn.reply,
      safety_flags: turn.safetyFlags,
      missing_fields: turn.missingFields,
      state_patch: turn.statePatch,
      handoff_brief: turn.handoffBrief,
    })
    .select("id")
    .single();
  if (turnError !== null) throw turnError;

  if (turn.toolCalls.length > 0) {
    const toolRows = turn.toolCalls.map((toolCall) => ({
      workspace_id: workspace.id,
      turn_id: turnRow.id,
      lead_id: lead.id,
      tool: toolCall.tool,
      requires_approval: toolCall.requiresApproval,
      reason: toolCall.reason,
      payload: toolCall.payload,
      policy_status: automationDecision.approvedTools.includes(toolCall.tool) ? "approved" : "blocked",
      execution_status: "pending",
      execution_output: {},
    }));
    const { error } = await supabase.from("harwick_ai_tool_calls").insert(toolRows);
    if (error !== null) throw error;
  }

  const { error: reviewError } = await supabase
    .from("social_reply_reviews")
    .update({
      suggested_reply: turn.reply,
      ai_decision: {
        engine,
        nextAction: turn.nextAction,
        confidence: turn.confidence,
        automationDecision,
        syntheticExpectedReply: persona.expectedReply,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", review.id)
    .eq("workspace_id", workspace.id);
  if (reviewError !== null) throw reviewError;

  if (enqueueAutoSendJobs && automationDecision.canAutoExecute) {
    const { error } = await supabase.from("workflow_jobs").upsert({
      workspace_id: workspace.id,
      lead_id: lead.id,
      lead_event_id: review.lead_event_id,
      job_type: "harwick_ai_reply",
      idempotency_key: `${SYNTHETIC_PREFIX}:harwick_ai_reply:${turnRow.id}`,
      payload: compactObject({
        jobType: "harwick_ai_reply",
        workspaceId: workspace.id,
        leadId: lead.id,
        turnId: turnRow.id,
        socialReplyReviewId: review.id,
        channel: persona.channel,
        providerAccountId: `${SYNTHETIC_PREFIX}:meta-account`,
        recipientUserId: `${SYNTHETIC_PREFIX}:user:${persona.key}`,
        sourceCommentId: persona.channel.endsWith("_comment") ? `${SYNTHETIC_PREFIX}:comment:${persona.key}` : null,
        sourcePostId: persona.listingKey === null ? null : `${SYNTHETIC_PREFIX}:post:${persona.listingKey}`,
      }),
      run_after: new Date().toISOString(),
      status: "queued",
    }, { onConflict: "workspace_id,idempotency_key" });
    if (error !== null) throw error;
  }

  return true;
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));
const envValues = await readLocalEnv(rootDirectory);
const supabaseUrl = requireEnvValue(envValues, "NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnvValue(envValues, "SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const ownerUser = await requireOwnerUser(supabase, envValues, options);
const workspace = await upsertWorkspace(supabase, envValues, options, ownerUser);

if (options.wipeTargetWorkspace) {
  await wipeTargetWorkspaceRows(supabase, workspace.id);
} else if (options.reset && options.targetCurrentWorkspace) {
  await resetSyntheticRows(supabase, workspace.id);
}

const aiRuntimeDeps = options.generateAiDrafts ? await loadAiRuntimeDeps(envValues) : null;
await seedIntegrationAccounts(supabase, workspace.id);
const members = await seedTeam(supabase, workspace, ownerUser);
const listingByKey = await seedListings(supabase, workspace.id);
await seedSocialPosts(supabase, workspace.id);
const counts = await seedLeadsAndQueues(supabase, workspace, members, listingByKey, options, aiRuntimeDeps);

console.log(JSON.stringify({
  workspaceId: workspace.id,
  workspaceSlug: workspace.slug,
  ownerEmail: ownerUser.email,
  mode: options.targetCurrentWorkspace ? "current_workspace" : "isolated_synthetic_workspace",
  resetMode: options.wipeTargetWorkspace ? "full_workspace_wipe" : options.reset ? "synthetic_rows" : "none",
  generatedAiDrafts: options.generateAiDrafts,
  enqueueAutoSendJobs: options.enqueueAutoSendJobs,
  teamMembers: members.size,
  listings: listingByKey.size,
  ...counts,
}, null, 2));
