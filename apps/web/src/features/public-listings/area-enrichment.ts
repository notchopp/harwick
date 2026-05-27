/**
 * Build-time area enrichment pipeline. Runs on listing import (or via a
 * manual one-shot script) and writes a ListingAreaIntel blob into
 * `listing_facts.raw_facts.area_intel` so Harwick reads it at zero
 * marginal cost per chat turn.
 *
 * Stack (everything free or generous-free-tier so workspaces don't get
 * a surprise bill):
 *
 *   - Mapbox Geocoding API — address → lat/lng (100k requests/month free)
 *   - Overpass / OpenStreetMap — POIs (schools, groceries, parks,
 *     restaurants, gyms, healthcare, shopping) within 2 miles (free,
 *     rate-limited to ~10k/day per IP)
 *   - US Census Bureau ACS API — median household income, median age,
 *     population density by zip (FREE, no API key required)
 *   - Brave Search — school ratings + walkability narrative (2000
 *     queries/month free)
 *
 * Each step is fail-soft: a Mapbox failure doesn't block POI lookup; an
 * Overpass timeout doesn't block Census; a Brave miss doesn't block
 * what's already gathered. The output is always a partial-or-full
 * ListingAreaIntel — never throws.
 *
 * Env vars (all optional — pipeline silently skips the missing stage):
 *   MAPBOX_ACCESS_TOKEN
 *   BRAVE_SEARCH_API_KEY
 *
 * To wire to listing-import: call `enrichListingArea` from the manual
 * listing insert path + URL importer + IDX/Repliers sync, store the
 * result on raw_facts.area_intel. To refresh: run the same function
 * weekly via cron.
 */

import type { ListingAreaIntel } from "@realty-ops/core";

import { lookupAreaInfo } from "./area-lookup";

type EnrichmentInput = {
  address: string;
  // If listing already has zip in raw_facts, prefer it. Otherwise the
  // Mapbox response gives us one.
  zipHint?: string | null;
  mapboxToken: string | undefined;
  braveApiKey: string | undefined;
  // Test seam — replace network calls with deterministic fakes.
  fetchImpl?: typeof fetch;
};

type GeocodeResult = {
  lat: number;
  lng: number;
  zip: string | null;
  city: string | null;
  state: string | null;
};

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const MAPBOX_GEOCODE_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const CENSUS_ACS_BASE = "https://api.census.gov/data/2022/acs/acs5";

async function geocode(params: {
  address: string;
  mapboxToken: string;
  fetchImpl: typeof fetch;
}): Promise<GeocodeResult | null> {
  const url = `${MAPBOX_GEOCODE_BASE}/${encodeURIComponent(params.address)}.json?access_token=${encodeURIComponent(params.mapboxToken)}&limit=1&country=US&types=address,place,postcode`;
  try {
    const response = await params.fetchImpl(url);
    if (!response.ok) return null;
    const data = await response.json() as {
      features?: Array<{
        center?: [number, number];
        context?: Array<{ id?: string; text?: string; short_code?: string }>;
        properties?: { short_code?: string };
      }>;
    };
    const feature = data.features?.[0];
    if (feature === undefined || feature.center === undefined) return null;
    const [lng, lat] = feature.center;
    const context = feature.context ?? [];
    const zipCtx = context.find((c) => c.id?.startsWith("postcode"));
    const cityCtx = context.find((c) => c.id?.startsWith("place"));
    const stateCtx = context.find((c) => c.id?.startsWith("region"));
    return {
      lat,
      lng,
      zip: zipCtx?.text ?? null,
      city: cityCtx?.text ?? null,
      // Mapbox returns state short_code like "US-TX" — strip prefix.
      state: stateCtx?.short_code?.replace(/^US-/, "") ?? stateCtx?.text ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Overpass QL query for POIs within ~2 miles (3.2km radius). Returns a
 * single query covering all categories so we only hit the API once.
 */
function buildOverpassQuery(lat: number, lng: number, radiusMeters = 3200): string {
  return `
    [out:json][timeout:10];
    (
      node["amenity"="school"](around:${radiusMeters},${lat},${lng});
      node["shop"="supermarket"](around:${radiusMeters},${lat},${lng});
      node["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});
      node["leisure"="park"](around:${radiusMeters},${lat},${lng});
      node["leisure"="fitness_centre"](around:${radiusMeters},${lat},${lng});
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      node["amenity"="clinic"](around:${radiusMeters},${lat},${lng});
      node["shop"="mall"](around:${radiusMeters},${lat},${lng});
    );
    out tags 50;
  `.trim();
}

type OverpassElement = {
  tags?: {
    name?: string;
    amenity?: string;
    shop?: string;
    leisure?: string;
    "isced:level"?: string;
  };
};

async function fetchPOIs(params: {
  lat: number;
  lng: number;
  fetchImpl: typeof fetch;
}): Promise<ListingAreaIntel["nearbyPOIs"] & { schoolsRaw: string[] }> {
  const empty = {
    groceries: [] as string[],
    restaurants: [] as string[],
    parks: [] as string[],
    gyms: [] as string[],
    healthcare: [] as string[],
    shopping: [] as string[],
    schoolsRaw: [] as string[],
  };
  try {
    const response = await params.fetchImpl(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: buildOverpassQuery(params.lat, params.lng),
    });
    if (!response.ok) return empty;
    const data = await response.json() as { elements?: OverpassElement[] };
    const elements = data.elements ?? [];
    const seen = new Set<string>();
    for (const element of elements) {
      const name = element.tags?.name?.trim();
      if (name === undefined || name.length === 0 || seen.has(name)) continue;
      seen.add(name);
      if (element.tags?.amenity === "school") empty.schoolsRaw.push(name);
      else if (element.tags?.shop === "supermarket") empty.groceries.push(name);
      else if (element.tags?.amenity === "restaurant") empty.restaurants.push(name);
      else if (element.tags?.leisure === "park") empty.parks.push(name);
      else if (element.tags?.leisure === "fitness_centre") empty.gyms.push(name);
      else if (element.tags?.amenity === "hospital" || element.tags?.amenity === "clinic") empty.healthcare.push(name);
      else if (element.tags?.shop === "mall") empty.shopping.push(name);
    }
    // Cap each category at 10 to keep the prompt budget bounded.
    return {
      groceries: empty.groceries.slice(0, 10),
      restaurants: empty.restaurants.slice(0, 10),
      parks: empty.parks.slice(0, 10),
      gyms: empty.gyms.slice(0, 10),
      healthcare: empty.healthcare.slice(0, 10),
      shopping: empty.shopping.slice(0, 10),
      schoolsRaw: empty.schoolsRaw.slice(0, 10),
    };
  } catch {
    return empty;
  }
}

async function fetchCensusDemographics(params: {
  zip: string;
  fetchImpl: typeof fetch;
}): Promise<ListingAreaIntel["demographics"]> {
  // ACS 5-year — median household income (B19013_001E), median age
  // (B01002_001E), total population (B01003_001E). Returns arrays where
  // index 0 is headers and index 1 is data.
  const url = `${CENSUS_ACS_BASE}?get=B19013_001E,B01002_001E,B01003_001E&for=zip%20code%20tabulation%20area:${encodeURIComponent(params.zip)}`;
  try {
    const response = await params.fetchImpl(url);
    if (!response.ok) return null;
    const data = await response.json() as Array<Array<string>>;
    const row = data[1];
    if (row === undefined) return null;
    const income = Number(row[0]);
    const age = Number(row[1]);
    const pop = Number(row[2]);
    return {
      medianHouseholdIncome: Number.isFinite(income) && income > 0 ? income : null,
      medianAge: Number.isFinite(age) && age > 0 ? age : null,
      // ZCTAs are not areal so density is approximate — surface raw pop instead.
      populationDensity: Number.isFinite(pop) && pop > 0 ? pop : null,
    };
  } catch {
    return null;
  }
}

/**
 * Parse Brave Search results for school ratings. We search "schools near
 * {address}" and look for "X/10" rating patterns from common sources
 * (GreatSchools, Niche, U.S. News). The school NAMES come from Overpass
 * (more reliable), and we attach ratings here when we can find them.
 */
async function fetchSchoolRatings(params: {
  schoolNames: readonly string[];
  contextLocation: string;
  braveApiKey: string | undefined;
  fetchImpl: typeof fetch;
}): Promise<ListingAreaIntel["schools"]> {
  if (params.schoolNames.length === 0) return [];
  const results: ListingAreaIntel["schools"] = [];
  for (const name of params.schoolNames.slice(0, 6)) {
    const lookup = await lookupAreaInfo({
      query: `${name} school rating`,
      contextLocation: params.contextLocation,
      apiKey: params.braveApiKey,
      fetchImpl: params.fetchImpl,
      timeoutMs: 4000,
    });
    let rating: number | null = null;
    let ratingSource: string | null = null;
    if (lookup.available) {
      // Look for "X/10" or "rated X" in citation snippets, prefer
      // GreatSchools / Niche / U.S. News sources.
      for (const citation of lookup.citations) {
        const haystack = `${citation.title} ${citation.snippet}`;
        const rateMatch = haystack.match(/\b(10|[1-9])\s*\/\s*10\b/);
        if (rateMatch?.[1] !== undefined) {
          rating = Number(rateMatch[1]);
          if (/greatschools/i.test(citation.url)) ratingSource = "GreatSchools";
          else if (/niche\.com/i.test(citation.url)) ratingSource = "Niche";
          else if (/usnews\.com/i.test(citation.url)) ratingSource = "U.S. News";
          else ratingSource = new URL(citation.url).hostname;
          break;
        }
      }
    }
    // Crude level inference from name. Better than nothing for the model.
    const lowerName = name.toLowerCase();
    const level: "elementary" | "middle" | "high" | "unknown" = lowerName.includes("elementary")
      ? "elementary"
      : lowerName.includes("middle") || lowerName.includes("junior")
        ? "middle"
        : lowerName.includes("high")
          ? "high"
          : "unknown";
    results.push({
      name,
      level,
      rating,
      ratingSource,
      distanceMiles: null,
    });
  }
  return results;
}

/**
 * Top-level enrichment. Always returns a ListingAreaIntel (partial if
 * any stage fails), never throws. Callers store the result on
 * `listing_facts.raw_facts.area_intel`.
 */
export async function enrichListingArea(params: EnrichmentInput): Promise<ListingAreaIntel> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const now = new Date().toISOString();

  // Stage 1: geocode (skipped if no Mapbox token configured)
  const geo = params.mapboxToken === undefined || params.mapboxToken.length === 0
    ? null
    : await geocode({ address: params.address, mapboxToken: params.mapboxToken, fetchImpl });

  // Stage 2: POIs via Overpass — only if we got coordinates
  const pois = geo === null
    ? { groceries: [], restaurants: [], parks: [], gyms: [], healthcare: [], shopping: [], schoolsRaw: [] }
    : await fetchPOIs({ lat: geo.lat, lng: geo.lng, fetchImpl });

  // Stage 3: Census demographics — only if we have a zip (from geocode or hint)
  const zip = geo?.zip ?? params.zipHint ?? null;
  const demographics = zip === null ? null : await fetchCensusDemographics({ zip, fetchImpl });

  // Stage 4: School ratings via Brave — only if we have school names + key
  const contextLocation = [geo?.city, geo?.state, zip].filter((x): x is string => x !== null).join(" ");
  const schools = await fetchSchoolRatings({
    schoolNames: pois.schoolsRaw,
    contextLocation: contextLocation.length > 0 ? contextLocation : params.address,
    braveApiKey: params.braveApiKey,
    fetchImpl,
  });

  // Walkability — derive a rough score from POI density (groceries +
  // restaurants + parks within 2 miles). Not a real Walk Score but
  // gives the model a directional answer when WalkScore API isn't
  // configured. 0-100 capped.
  const density = pois.groceries.length + pois.restaurants.length + pois.parks.length;
  const walkability = density === 0
    ? null
    : {
        score: Math.min(100, density * 4),
        label: density > 15 ? "very walkable" : density > 8 ? "somewhat walkable" : "car-dependent",
        source: "derived-from-osm-poi-density",
      };

  return {
    coordinates: geo === null ? null : { lat: geo.lat, lng: geo.lng },
    schools,
    nearbyPOIs: {
      groceries: pois.groceries,
      restaurants: pois.restaurants,
      parks: pois.parks,
      gyms: pois.gyms,
      healthcare: pois.healthcare,
      shopping: pois.shopping,
    },
    demographics,
    walkability,
    lastEnrichedAt: now,
  };
}
