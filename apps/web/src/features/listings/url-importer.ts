import type { ListingUrlImportDraft, ManualListingFactRequest } from "@realty-ops/core";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2_500_000;
const USER_AGENT = "HarwickListingImporter/1.0 (+https://harwick.lol)";

const REAL_ESTATE_TYPES = new Set([
  "RealEstateListing",
  "SingleFamilyResidence",
  "House",
  "Residence",
  "Apartment",
  "ApartmentComplex",
  "Place",
  "Accommodation",
  "Product",
]);

const JSON_LD_REGEX = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const META_REGEX = /<meta\b[^>]*?(?:property|name)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*?\/?>/gi;
const META_REGEX_REVERSED = /<meta\b[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']([^"']+)["'][^>]*?\/?>/gi;
const TITLE_REGEX = /<title\b[^>]*>([\s\S]*?)<\/title>/i;

export type UrlImportOptions = {
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => Date;
};

export type UrlImportFailure = {
  ok: false;
  reason: "fetch_failed" | "unsupported_content_type" | "no_data";
  message: string;
};

export type UrlImportSuccess = {
  ok: true;
  draft: ListingUrlImportDraft;
};

export type UrlImportResult = UrlImportSuccess | UrlImportFailure;

export async function importListingFromUrl(
  rawUrl: string,
  options: UrlImportOptions = {},
): Promise<UrlImportResult> {
  const fetchFn = options.fetcher ?? fetch;
  const now = (options.now ?? (() => new Date()))();

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "fetch_failed", message: "URL is malformed." };
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return { ok: false, reason: "fetch_failed", message: "URL must use http(s)." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchFn(parsedUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : "Could not reach the URL.";
    return { ok: false, reason: "fetch_failed", message };
  }
  clearTimeout(timeout);

  if (!response.ok) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: `Source returned HTTP ${response.status}.`,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    return {
      ok: false,
      reason: "unsupported_content_type",
      message: `Expected an HTML page; received ${contentType || "unknown"}.`,
    };
  }

  const html = await readBoundedText(response, MAX_HTML_BYTES);
  const sourceUrl = parsedUrl.toString();

  const jsonLdExtraction = extractFromJsonLd(html);
  const ogExtraction = extractFromOpenGraph(html);
  const titleExtraction = extractTitleFallback(html);

  const merged = mergeExtractions({
    sourceUrl,
    jsonLd: jsonLdExtraction.draft,
    openGraph: ogExtraction.draft,
    title: titleExtraction,
  });

  if (merged === null) {
    return {
      ok: false,
      reason: "no_data",
      message: "Could not extract listing facts from the page.",
    };
  }

  const warnings = [...jsonLdExtraction.warnings, ...ogExtraction.warnings];
  const source: ListingUrlImportDraft["source"] = jsonLdExtraction.draft !== null
    ? "json_ld"
    : ogExtraction.draft !== null
      ? "open_graph"
      : "vision_fallback";

  return {
    ok: true,
    draft: {
      source,
      sourceUrl,
      fetchedAt: now.toISOString(),
      draft: merged,
      warnings,
    },
  };
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let total = 0;
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      html += decoder.decode(value.subarray(0, Math.max(0, value.byteLength - (total - maxBytes))));
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    html += decoder.decode(value, { stream: true });
  }
  html += decoder.decode();
  return html;
}

type PartialDraft = Partial<ManualListingFactRequest>;

type ExtractionOutcome = {
  draft: PartialDraft | null;
  warnings: string[];
};

function extractFromJsonLd(html: string): ExtractionOutcome {
  const warnings: string[] = [];
  const nodes: unknown[] = [];

  for (const match of html.matchAll(JSON_LD_REGEX)) {
    const raw = (match[1] ?? "").trim();
    if (raw.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(decodeHtmlEntities(raw));
      flattenLdNodes(parsed, nodes);
    } catch {
      warnings.push("One JSON-LD block on the page was malformed and was skipped.");
    }
  }

  const listingNode = nodes.find((node) => isListingShaped(node));
  if (listingNode === undefined || typeof listingNode !== "object" || listingNode === null) {
    return { draft: null, warnings };
  }

  const node = listingNode as Record<string, unknown>;
  const draft: PartialDraft = {};

  const addressParts = readAddressPartsFromLd(node);
  if (addressParts.full !== null) draft.address = addressParts.full;
  if (addressParts.city !== null) draft.city = addressParts.city;
  if (addressParts.state !== null) draft.state = addressParts.state;
  if (addressParts.postalCode !== null) draft.postalCode = addressParts.postalCode;
  if (addressParts.neighborhood !== null) draft.neighborhood = addressParts.neighborhood;

  const mlsNumber = readStringField(node, ["mlsNumber", "mlsId", "productID", "sku"]);
  if (mlsNumber !== null) draft.mlsNumber = mlsNumber.slice(0, 120);

  const externalId = readStringField(node, ["@id", "identifier", "url"]);
  if (externalId !== null) draft.externalListingId = externalId.slice(0, 160);

  const price = readPriceFromLd(node);
  if (price !== null) draft.price = price;

  const status = readAvailability(node);
  if (status !== null) draft.status = status;

  const beds = readNumericField(node, ["numberOfBedrooms", "numberOfRooms"]);
  if (beds !== null) draft.beds = beds;

  const totalBaths = readNumericField(node, ["numberOfBathroomsTotal", "numberOfBathrooms"]);
  const fullBaths = readNumericField(node, ["numberOfFullBathrooms", "fullBathrooms"]);
  const halfBaths = readNumericField(node, ["numberOfPartialBathrooms", "halfBathrooms"]);
  if (totalBaths !== null) draft.baths = totalBaths;
  else if (fullBaths !== null || halfBaths !== null) {
    draft.baths = (fullBaths ?? 0) + (halfBaths ?? 0) * 0.5;
  }
  if (fullBaths !== null) draft.fullBathrooms = Math.round(fullBaths);
  if (halfBaths !== null) draft.halfBathrooms = Math.round(halfBaths);

  const sqft = readFloorSize(node);
  if (sqft !== null) draft.squareFeet = sqft;

  const lot = readLotSize(node);
  if (lot !== null) draft.lotSizeSqft = lot;

  const yearBuilt = readNumericField(node, ["yearBuilt", "constructionYear"]);
  if (yearBuilt !== null && yearBuilt >= 1600 && yearBuilt <= 2100) {
    draft.yearBuilt = Math.round(yearBuilt);
  }

  const hoa = readNumericField(node, ["monthlyHoa", "homeownersAssociationFee", "associationFee"]);
  if (hoa !== null) draft.monthlyHoa = hoa;

  const parking = readNumericField(node, ["numberOfParkingSpaces", "parkingSpaces"]);
  if (parking !== null) draft.parkingSpaces = Math.round(parking);

  const geo = readGeo(node);
  if (geo !== null) {
    draft.latitude = geo.latitude;
    draft.longitude = geo.longitude;
  }

  const photos = readPhotosFromLd(node);
  if (photos.length > 0) {
    draft.photoUrl = photos[0];
    draft.mediaUrls = photos.slice(0, 40);
  }

  const description = readStringField(node, ["description"]);
  if (description !== null) draft.notes = description.slice(0, 4000);

  const propertyType = inferPropertyType(node);
  if (propertyType !== null) draft.propertyType = propertyType.slice(0, 120);

  const amenities = readAmenities(node);
  if (amenities.length > 0) {
    draft.amenities = amenities.slice(0, 40);
    if (amenities.some((value) => /pool/i.test(value))) draft.hasPool = true;
  }

  const agent = readAgent(node);
  if (agent.name !== null) draft.listingAgentName = agent.name.slice(0, 160);
  if (agent.brokerage !== null) draft.listingBrokerage = agent.brokerage.slice(0, 160);

  const datePosted = readStringField(node, ["datePosted", "dateAvailable"]);
  if (datePosted !== null) {
    const posted = Date.parse(datePosted);
    if (Number.isFinite(posted)) {
      const days = Math.max(0, Math.floor((Date.now() - posted) / 86_400_000));
      draft.daysOnMarket = days;
    }
  }

  if (Object.keys(draft).length === 0) {
    return { draft: null, warnings };
  }
  return { draft, warnings };
}

function flattenLdNodes(value: unknown, out: unknown[]): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const child of value) flattenLdNodes(child, out);
    return;
  }
  if (typeof value === "object") {
    out.push(value);
    const node = value as Record<string, unknown>;
    if (Array.isArray(node["@graph"])) {
      for (const child of node["@graph"] as unknown[]) flattenLdNodes(child, out);
    }
  }
}

function isListingShaped(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  if (typeof type === "string") return REAL_ESTATE_TYPES.has(type);
  if (Array.isArray(type)) {
    return type.some((value) => typeof value === "string" && REAL_ESTATE_TYPES.has(value));
  }
  return record["address"] !== undefined || record["offers"] !== undefined;
}

type ParsedAddress = {
  full: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  neighborhood: string | null;
};

function readAddressPartsFromLd(node: Record<string, unknown>): ParsedAddress {
  const direct = readStringField(node, ["streetAddress", "name"]);
  const result: ParsedAddress = {
    full: direct === null ? null : direct.slice(0, 240),
    street: null,
    city: null,
    state: null,
    postalCode: null,
    neighborhood: readStringField(node, ["neighborhood", "addressNeighborhood"]),
  };

  const addressNode = node["address"];
  if (typeof addressNode === "object" && addressNode !== null) {
    const addressRecord = addressNode as Record<string, unknown>;
    result.street = readStringField(addressRecord, ["streetAddress"]);
    result.city = readStringField(addressRecord, ["addressLocality"]);
    result.state = readStringField(addressRecord, ["addressRegion"]);
    result.postalCode = readStringField(addressRecord, ["postalCode"]);
    if (result.neighborhood === null) {
      result.neighborhood = readStringField(addressRecord, ["addressSubregion", "neighborhood"]);
    }
    const parts = [result.street ?? direct,
      [result.city, result.state].filter((value) => value !== null).join(", "),
      result.postalCode,
    ].filter((part) => part !== null && part.length > 0);
    if (parts.length > 0) {
      result.full = parts.join(", ").slice(0, 240);
    }
  }

  return result;
}

function readAvailability(node: Record<string, unknown>): string | null {
  const offers = node["offers"];
  const offersNode: unknown = Array.isArray(offers) ? offers[0] : offers;
  if (typeof offersNode === "object" && offersNode !== null) {
    const availability = readStringField(offersNode as Record<string, unknown>, ["availability"]);
    if (availability !== null) {
      const normalized = availability.toLowerCase();
      if (normalized.includes("instock")) return "Active";
      if (normalized.includes("soldout")) return "Sold";
      if (normalized.includes("preorder")) return "Pending";
      if (normalized.includes("limited")) return "Pending";
    }
  }
  return null;
}

function readLotSize(node: Record<string, unknown>): number | null {
  const lotNode = node["lotSize"] ?? node["lotSizeArea"];
  if (typeof lotNode === "object" && lotNode !== null) {
    const record = lotNode as Record<string, unknown>;
    const value = record["value"];
    const unit = readStringField(record, ["unitCode", "unitText"]);
    let numericValue: number | null = null;
    if (typeof value === "number" && Number.isFinite(value)) numericValue = value;
    else if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) numericValue = parsed;
    }
    if (numericValue === null) return null;
    if (unit !== null && /acre/i.test(unit)) return Math.round(numericValue * 43_560);
    return Math.round(numericValue);
  }
  const direct = readNumericField(node, ["lotSizeSqft", "lotSize"]);
  return direct === null ? null : Math.round(direct);
}

function readGeo(node: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const geoNode = node["geo"];
  if (typeof geoNode === "object" && geoNode !== null) {
    const record = geoNode as Record<string, unknown>;
    const lat = readNumericField(record, ["latitude"]);
    const lon = readNumericField(record, ["longitude"]);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { latitude: lat, longitude: lon };
    }
  }
  return null;
}

function inferPropertyType(node: Record<string, unknown>): string | null {
  const type = node["@type"];
  if (typeof type === "string" && REAL_ESTATE_TYPES.has(type) && type !== "Product" && type !== "Place") {
    return type;
  }
  if (Array.isArray(type)) {
    for (const value of type) {
      if (typeof value === "string" && REAL_ESTATE_TYPES.has(value) && value !== "Product" && value !== "Place") {
        return value;
      }
    }
  }
  return readStringField(node, ["category", "propertyType"]);
}

function readAmenities(node: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const candidates = [node["amenityFeature"], node["amenities"], node["additionalProperty"]];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === "string" && entry.trim().length > 0) out.add(entry.trim());
        else if (typeof entry === "object" && entry !== null) {
          const value = readStringField(entry as Record<string, unknown>, ["name", "value"]);
          if (value !== null) out.add(value);
        }
      }
    } else if (typeof candidate === "string" && candidate.trim().length > 0) {
      out.add(candidate.trim());
    }
  }
  return [...out];
}

function readAgent(node: Record<string, unknown>): { name: string | null; brokerage: string | null } {
  const result: { name: string | null; brokerage: string | null } = { name: null, brokerage: null };
  const agentNode = node["seller"] ?? node["agent"] ?? node["broker"] ?? node["listingAgent"];
  if (typeof agentNode === "object" && agentNode !== null) {
    const record = agentNode as Record<string, unknown>;
    result.name = readStringField(record, ["name"]);
    const works = record["worksFor"] ?? record["affiliation"];
    if (typeof works === "object" && works !== null) {
      result.brokerage = readStringField(works as Record<string, unknown>, ["name"]);
    }
  }
  if (result.brokerage === null) {
    const provider = node["provider"];
    if (typeof provider === "object" && provider !== null) {
      result.brokerage = readStringField(provider as Record<string, unknown>, ["name"]);
    }
  }
  return result;
}

function readStringField(node: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readNumericField(node: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      const inner = record["value"];
      if (typeof inner === "number" && Number.isFinite(inner)) return inner;
      if (typeof inner === "string") {
        const parsed = Number(inner);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function readFloorSize(node: Record<string, unknown>): number | null {
  const floorSize = node["floorSize"];
  if (typeof floorSize === "object" && floorSize !== null) {
    const record = floorSize as Record<string, unknown>;
    const value = record["value"];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
  }
  const sqft = readNumericField(node, ["squareFeet", "sqft"]);
  return sqft === null ? null : Math.round(sqft);
}

function readPriceFromLd(node: Record<string, unknown>): number | null {
  const offers = node["offers"];
  if (typeof offers === "object" && offers !== null) {
    const offersNode: unknown = Array.isArray(offers) ? offers[0] : offers;
    if (typeof offersNode === "object" && offersNode !== null) {
      const price = readNumericField(offersNode as Record<string, unknown>, ["price"]);
      if (price !== null) return Math.round(price);
    }
  }
  const direct = readNumericField(node, ["price"]);
  return direct === null ? null : Math.round(direct);
}

function readPhotosFromLd(node: Record<string, unknown>): string[] {
  const photos = node["photo"] ?? node["image"];
  const collected: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) collected.push(value);
    else if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      const url = record["url"] ?? record["contentUrl"];
      if (typeof url === "string" && /^https?:\/\//i.test(url)) collected.push(url);
    }
  };
  if (Array.isArray(photos)) {
    for (const entry of photos) push(entry);
  } else {
    push(photos);
  }
  return Array.from(new Set(collected));
}

function extractFromOpenGraph(html: string): ExtractionOutcome {
  const meta = collectMetaTags(html);
  const warnings: string[] = [];
  const draft: PartialDraft = {};

  const title = meta["og:title"] ?? meta["twitter:title"];
  const description = meta["og:description"] ?? meta["twitter:description"];
  const image = meta["og:image"] ?? meta["og:image:secure_url"] ?? meta["twitter:image"];
  const price = meta["product:price:amount"] ?? meta["og:price:amount"];
  const street = meta["og:street-address"];
  const locality = meta["og:locality"];
  const region = meta["og:region"];
  const postal = meta["og:postal-code"];
  const latitude = meta["place:location:latitude"] ?? meta["og:latitude"] ?? meta["geo.position"];
  const longitude = meta["place:location:longitude"] ?? meta["og:longitude"];

  if (title !== undefined && title.trim().length > 0) {
    draft.address = title.trim().slice(0, 240);
  }
  if ([street, locality, region, postal].some((value) => value !== undefined)) {
    const parts = [street, [locality, region].filter((value) => value !== undefined).join(", "), postal]
      .filter((value) => value !== undefined && value.length > 0) as string[];
    if (parts.length > 0) {
      draft.address = parts.join(", ").slice(0, 240);
    }
  }
  if (locality !== undefined) draft.city = locality;
  if (region !== undefined) draft.state = region;
  if (postal !== undefined) draft.postalCode = postal;
  if (description !== undefined && description.trim().length > 0) {
    draft.notes = description.trim().slice(0, 4000);
  }
  if (image !== undefined && /^https?:\/\//i.test(image)) {
    draft.photoUrl = image;
    draft.mediaUrls = [image];
  }
  if (price !== undefined) {
    const parsed = Number(price.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      draft.price = Math.round(parsed);
    }
  }
  if (latitude !== undefined) {
    const lat = Number(String(latitude).split(/[;\s,]/)[0]);
    if (Number.isFinite(lat) && Math.abs(lat) <= 90) draft.latitude = lat;
  }
  if (longitude !== undefined) {
    const lon = Number(longitude);
    if (Number.isFinite(lon) && Math.abs(lon) <= 180) draft.longitude = lon;
  }

  if (Object.keys(draft).length === 0) {
    return { draft: null, warnings };
  }
  return { draft, warnings };
}

function extractTitleFallback(html: string): PartialDraft | null {
  const match = html.match(TITLE_REGEX);
  if (match === null || match[1] === undefined) return null;
  const title = decodeHtmlEntities(match[1]).trim();
  if (title.length === 0) return null;
  return { address: title.slice(0, 240) };
}

function collectMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const match of html.matchAll(META_REGEX)) {
    const key = (match[1] ?? "").trim().toLowerCase();
    const value = decodeHtmlEntities((match[2] ?? "").trim());
    if (key.length > 0 && value.length > 0 && !(key in tags)) {
      tags[key] = value;
    }
  }
  for (const match of html.matchAll(META_REGEX_REVERSED)) {
    const key = (match[2] ?? "").trim().toLowerCase();
    const value = decodeHtmlEntities((match[1] ?? "").trim());
    if (key.length > 0 && value.length > 0 && !(key in tags)) {
      tags[key] = value;
    }
  }
  return tags;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const value = Number.parseInt(code, 16);
      return Number.isFinite(value) ? String.fromCharCode(value) : _;
    });
}

function mergeExtractions(params: {
  sourceUrl: string;
  jsonLd: PartialDraft | null;
  openGraph: PartialDraft | null;
  title: PartialDraft | null;
}): ManualListingFactRequest | null {
  const partial: PartialDraft = {
    ...(params.title ?? {}),
    ...(params.openGraph ?? {}),
    ...(params.jsonLd ?? {}),
  };

  if (typeof partial.address !== "string" || partial.address.trim().length === 0) {
    return null;
  }

  return {
    address: partial.address.trim().slice(0, 240),
    ...(partial.externalListingId === undefined ? {} : { externalListingId: partial.externalListingId }),
    ...(partial.mlsNumber === undefined ? {} : { mlsNumber: partial.mlsNumber }),
    ...(partial.neighborhood === undefined ? {} : { neighborhood: partial.neighborhood }),
    ...(partial.city === undefined ? {} : { city: partial.city }),
    ...(partial.state === undefined ? {} : { state: partial.state }),
    ...(partial.postalCode === undefined ? {} : { postalCode: partial.postalCode }),
    ...(partial.propertyType === undefined ? {} : { propertyType: partial.propertyType }),
    ...(partial.status === undefined ? {} : { status: partial.status }),
    ...(partial.price === undefined ? {} : { price: partial.price }),
    ...(partial.beds === undefined ? {} : { beds: partial.beds }),
    ...(partial.baths === undefined ? {} : { baths: partial.baths }),
    ...(partial.fullBathrooms === undefined ? {} : { fullBathrooms: partial.fullBathrooms }),
    ...(partial.halfBathrooms === undefined ? {} : { halfBathrooms: partial.halfBathrooms }),
    ...(partial.squareFeet === undefined ? {} : { squareFeet: partial.squareFeet }),
    ...(partial.lotSizeSqft === undefined ? {} : { lotSizeSqft: partial.lotSizeSqft }),
    ...(partial.yearBuilt === undefined ? {} : { yearBuilt: partial.yearBuilt }),
    ...(partial.monthlyHoa === undefined ? {} : { monthlyHoa: partial.monthlyHoa }),
    ...(partial.parkingSpaces === undefined ? {} : { parkingSpaces: partial.parkingSpaces }),
    ...(partial.latitude === undefined ? {} : { latitude: partial.latitude }),
    ...(partial.longitude === undefined ? {} : { longitude: partial.longitude }),
    ...(partial.hasPool === undefined ? {} : { hasPool: partial.hasPool }),
    ...(partial.photoUrl === undefined ? {} : { photoUrl: partial.photoUrl }),
    ...(partial.videoUrl === undefined ? {} : { videoUrl: partial.videoUrl }),
    ...(partial.mediaUrls === undefined ? {} : { mediaUrls: partial.mediaUrls }),
    ...(partial.notes === undefined ? {} : { notes: partial.notes }),
    publicUrl: params.sourceUrl,
    ...(partial.incentives === undefined ? {} : { incentives: partial.incentives }),
    ...(partial.amenities === undefined ? {} : { amenities: partial.amenities }),
    ...(partial.listingAgentName === undefined ? {} : { listingAgentName: partial.listingAgentName }),
    ...(partial.listingBrokerage === undefined ? {} : { listingBrokerage: partial.listingBrokerage }),
    ...(partial.daysOnMarket === undefined ? {} : { daysOnMarket: partial.daysOnMarket }),
  };
}
