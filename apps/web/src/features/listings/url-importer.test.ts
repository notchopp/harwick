import { describe, expect, it } from "vitest";
import { importListingFromUrl } from "./url-importer";

type FetchHandler = (url: string, init: RequestInit) => Promise<Response>;

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

function fetcherFor(html: string, init?: ResponseInit): FetchHandler {
  return () => Promise.resolve(htmlResponse(html, init));
}

const HAR_LIKE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>7710 Sharondale Dr, Houston, TX 77033 | HAR</title>
  <meta property="og:title" content="7710 Sharondale Dr, Houston, TX 77033" />
  <meta property="og:image" content="https://photos.har.com/3214581/cover.jpg" />
  <meta property="og:description" content="Charming 3 bedroom 2 bath single family home." />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SingleFamilyResidence",
    "name": "7710 Sharondale Dr",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "7710 Sharondale Dr",
      "addressLocality": "Houston",
      "addressRegion": "TX",
      "postalCode": "77033"
    },
    "numberOfBedrooms": 3,
    "numberOfBathroomsTotal": 2,
    "floorSize": { "@type": "QuantitativeValue", "value": 1450, "unitCode": "FTK" },
    "offers": { "@type": "Offer", "price": 289000, "priceCurrency": "USD" },
    "photo": [
      "https://photos.har.com/3214581/01.jpg",
      "https://photos.har.com/3214581/02.jpg"
    ],
    "mlsNumber": "12345678"
  }
  </script>
</head>
<body><h1>Listing</h1></body>
</html>
`;

const OG_ONLY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Mountain View Condo - $725,000</title>
  <meta name="og:title" content="Mountain View Condo - 2BR 2BA" />
  <meta property="og:image" content="https://cdn.example.com/condo-hero.jpg" />
  <meta property="og:description" content="South-facing condo with city views" />
  <meta property="product:price:amount" content="725000" />
  <meta property="og:street-address" content="987 Skyline Pl" />
  <meta property="og:locality" content="Denver" />
  <meta property="og:region" content="CO" />
  <meta property="og:postal-code" content="80202" />
</head>
<body></body>
</html>
`;

const GRAPH_NESTED_HTML = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "name": "Some Broker" },
    {
      "@type": "Product",
      "name": "1234 Oak St, Austin, TX 78702",
      "image": { "@type": "ImageObject", "url": "https://cdn.example.com/oak.jpg" },
      "offers": [{ "@type": "Offer", "price": "510000" }]
    }
  ]
}
</script>
<title>1234 Oak St — for sale</title>
</head><body /></html>
`;

describe("url importer", () => {
  it("extracts structured listing data from JSON-LD as primary source", async () => {
    const result = await importListingFromUrl("https://www.har.com/homedetail/sample", {
      fetcher: fetcherFor(HAR_LIKE_HTML),
      now: () => new Date("2026-05-23T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.source).toBe("json_ld");
    expect(result.draft.draft.address).toContain("7710 Sharondale Dr");
    expect(result.draft.draft.address).toContain("Houston");
    expect(result.draft.draft.beds).toBe(3);
    expect(result.draft.draft.baths).toBe(2);
    expect(result.draft.draft.squareFeet).toBe(1450);
    expect(result.draft.draft.price).toBe(289000);
    expect(result.draft.draft.photoUrl).toBe("https://photos.har.com/3214581/01.jpg");
    expect(result.draft.draft.mediaUrls).toHaveLength(2);
    expect(result.draft.draft.mlsNumber).toBe("12345678");
    expect(result.draft.draft.publicUrl).toBe("https://www.har.com/homedetail/sample");
  });

  it("falls back to OpenGraph metadata when JSON-LD is missing", async () => {
    const result = await importListingFromUrl("https://example.com/listing/condo", {
      fetcher: fetcherFor(OG_ONLY_HTML),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.source).toBe("open_graph");
    expect(result.draft.draft.address).toBe("987 Skyline Pl, Denver, CO, 80202");
    expect(result.draft.draft.price).toBe(725000);
    expect(result.draft.draft.photoUrl).toBe("https://cdn.example.com/condo-hero.jpg");
    expect(result.draft.draft.notes).toContain("South-facing");
  });

  it("walks JSON-LD @graph arrays to find listing-shaped nodes", async () => {
    const result = await importListingFromUrl("https://example.com/listing/oak", {
      fetcher: fetcherFor(GRAPH_NESTED_HTML),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.source).toBe("json_ld");
    expect(result.draft.draft.address).toContain("Oak St");
    expect(result.draft.draft.price).toBe(510000);
    expect(result.draft.draft.photoUrl).toBe("https://cdn.example.com/oak.jpg");
  });

  it("returns fetch_failed when the upstream returns a non-2xx response", async () => {
    const result = await importListingFromUrl("https://example.com/missing", {
      fetcher: () => Promise.resolve(new Response("not found", { status: 404, headers: { "content-type": "text/html" } })),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("fetch_failed");
  });

  it("rejects non-HTML responses", async () => {
    const result = await importListingFromUrl("https://example.com/data.json", {
      fetcher: () => Promise.resolve(new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsupported_content_type");
  });

  it("preserves the source URL in publicUrl for provenance tracking", async () => {
    const result = await importListingFromUrl("https://www.zillow.com/homedetails/xyz", {
      fetcher: fetcherFor(HAR_LIKE_HTML),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.draft.publicUrl).toBe("https://www.zillow.com/homedetails/xyz");
  });

  it("rejects no_data when neither JSON-LD nor OG produce an address", async () => {
    const result = await importListingFromUrl("https://example.com/empty", {
      fetcher: fetcherFor("<html><head></head><body><p>nothing here</p></body></html>"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_data");
  });

  it("falls back to <title> when only a page title is present", async () => {
    const result = await importListingFromUrl("https://example.com/bare", {
      fetcher: fetcherFor("<html><head><title>123 Elm St, Phoenix, AZ</title></head><body /></html>"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.draft.address).toContain("123 Elm St");
  });

  it("pulls deep listing data — lot size, year built, hoa, agent, geo, amenities", async () => {
    const RICH_HTML = `
<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SingleFamilyResidence",
  "name": "Modern 4BR in River Oaks",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "2200 River Oaks Blvd",
    "addressLocality": "Houston",
    "addressRegion": "TX",
    "postalCode": "77019"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": 29.7449, "longitude": -95.4194 },
  "numberOfBedrooms": 4,
  "numberOfFullBathrooms": 3,
  "numberOfPartialBathrooms": 1,
  "floorSize": { "@type": "QuantitativeValue", "value": 3820 },
  "lotSize": { "@type": "QuantitativeValue", "value": 0.32, "unitCode": "acre" },
  "yearBuilt": 2014,
  "monthlyHoa": 220,
  "numberOfParkingSpaces": 2,
  "amenityFeature": [
    { "@type": "LocationFeatureSpecification", "name": "Pool" },
    { "@type": "LocationFeatureSpecification", "name": "Smart thermostat" },
    "Hardwood floors"
  ],
  "seller": {
    "@type": "RealEstateAgent",
    "name": "Marcus Webb",
    "worksFor": { "@type": "Organization", "name": "Prestige Realty" }
  },
  "offers": { "@type": "Offer", "price": 1450000, "availability": "https://schema.org/InStock" },
  "photo": ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"]
}
</script>
</head><body /></html>`;

    const result = await importListingFromUrl("https://example.com/listing/river-oaks", {
      fetcher: fetcherFor(RICH_HTML),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const d = result.draft.draft;
    expect(d.city).toBe("Houston");
    expect(d.state).toBe("TX");
    expect(d.postalCode).toBe("77019");
    expect(d.latitude).toBeCloseTo(29.7449, 3);
    expect(d.longitude).toBeCloseTo(-95.4194, 3);
    expect(d.beds).toBe(4);
    expect(d.fullBathrooms).toBe(3);
    expect(d.halfBathrooms).toBe(1);
    expect(d.baths).toBe(3.5);
    expect(d.squareFeet).toBe(3820);
    expect(d.lotSizeSqft).toBe(13_939); // 0.32 acres * 43560 = 13939.2 → 13939
    expect(d.yearBuilt).toBe(2014);
    expect(d.monthlyHoa).toBe(220);
    expect(d.parkingSpaces).toBe(2);
    expect(d.amenities).toContain("Pool");
    expect(d.amenities).toContain("Smart thermostat");
    expect(d.hasPool).toBe(true);
    expect(d.listingAgentName).toBe("Marcus Webb");
    expect(d.listingBrokerage).toBe("Prestige Realty");
    expect(d.status).toBe("Active");
    expect(d.price).toBe(1_450_000);
    expect(d.propertyType).toBe("SingleFamilyResidence");
  });

  it("rejects malformed URLs", async () => {
    const result = await importListingFromUrl("not-a-url", {
      fetcher: () => Promise.resolve(new Response("", { status: 200 })),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("fetch_failed");
  });
});
