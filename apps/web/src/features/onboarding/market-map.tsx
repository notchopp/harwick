"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { MapPin } from "lucide-react";
import MapboxMap, {
  type MapRef,
  Marker,
  type ViewState,
} from "react-map-gl/mapbox";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Real Mapbox map for the onboarding primary-areas scene. Geocodes each area
 * the operator types, drops a pin, and re-fits the viewport to show all pins.
 *
 * Falls back to a sage-tinted neutral state when:
 *   - NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is missing
 *   - The browser is offline / the map fails to load
 *   - The operator hasn't typed any areas yet (shows continental US)
 */

const MAPBOX_TOKEN = process.env["NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"];

// Custom dark style with sage tint that matches the rest of the onboarding.
// Falls back to mapbox/dark-v11 if the custom style isn't published yet.
const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

type GeocodedArea = {
  query: string;
  longitude: number;
  latitude: number;
};

type MarketMapProps = {
  areas: ReadonlyArray<string>;
};

const DEFAULT_VIEW: Pick<ViewState, "longitude" | "latitude" | "zoom"> = {
  longitude: -97.5,
  latitude: 37.5,
  zoom: 3.2,
};

async function geocode(query: string): Promise<GeocodedArea | null> {
  if (MAPBOX_TOKEN === undefined || query.trim().length === 0) return null;
  try {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
    );
    url.searchParams.set("access_token", MAPBOX_TOKEN);
    url.searchParams.set("limit", "1");
    url.searchParams.set("types", "place,locality,neighborhood,postcode,district");
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = (await response.json()) as {
      features?: Array<{ center?: [number, number] }>;
    };
    const center = data.features?.[0]?.center;
    if (center === undefined) return null;
    return { query, longitude: center[0], latitude: center[1] };
  } catch {
    return null;
  }
}

export function MarketMap({ areas }: MarketMapProps) {
  const [geocoded, setGeocoded] = useState<GeocodedArea[]>([]);
  const cacheRef = useRef(new Map<string, GeocodedArea | null>());
  const mapRef = useRef<MapRef | null>(null);

  // Geocode any newly-added area and drop the cached ones for areas the
  // operator removed.
  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;

    async function resolveAll() {
      const resolved: GeocodedArea[] = [];
      for (const area of areas) {
        const cached = cache.get(area);
        if (cached !== undefined) {
          if (cached !== null) resolved.push(cached);
          continue;
        }
        const result = await geocode(area);
        cache.set(area, result);
        if (result !== null) resolved.push(result);
        if (cancelled) return;
      }
      if (!cancelled) setGeocoded(resolved);
    }

    void resolveAll();
    return () => {
      cancelled = true;
    };
  }, [areas]);

  // Fit the viewport to the resolved pins (or fall back to continental US).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || geocoded.length === 0) return;
    if (geocoded.length === 1) {
      const only = geocoded[0]!;
      map.flyTo({ center: [only.longitude, only.latitude], zoom: 11, duration: 1100 });
      return;
    }
    const longitudes = geocoded.map((entry) => entry.longitude);
    const latitudes = geocoded.map((entry) => entry.latitude);
    map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      { padding: 60, duration: 1100, maxZoom: 11 },
    );
  }, [geocoded]);

  const mapAvailable = MAPBOX_TOKEN !== undefined && MAPBOX_TOKEN.length > 0;

  const emptyHint = useMemo(() => {
    if (mapAvailable === false) return "Map unavailable — add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to see your market.";
    if (areas.length === 0) return "Type an area below — pins drop as you go.";
    if (geocoded.length === 0) return "Locating…";
    return null;
  }, [areas.length, geocoded.length, mapAvailable]);

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-[#0b1410]">
      <div className="relative h-[280px] w-full">
        {mapAvailable ? (
          <MapboxMap
            ref={(instance) => {
              mapRef.current = instance ?? null;
            }}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={DEFAULT_VIEW}
            mapStyle={MAP_STYLE}
            attributionControl={false}
            interactive={false}
            reuseMaps
            style={{ width: "100%", height: "100%" }}
          >
            {geocoded.map((pin) => (
              <Marker key={pin.query} longitude={pin.longitude} latitude={pin.latitude} anchor="bottom">
                <MapPinChip label={pin.query} />
              </Marker>
            ))}
          </MapboxMap>
        ) : (
          <FallbackMap />
        )}

        {/* Sage tint overlay — pulls the map closer to the onboarding palette
            without losing the underlying geography. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(184,211,197,0.18), transparent 65%),"
              + "linear-gradient(180deg, transparent 55%, rgba(7,17,13,0.75) 100%)",
          }}
        />
      </div>

      {emptyHint !== null ? (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/55 px-3 py-1 text-[11px] font-medium text-white/65 backdrop-blur-md">
          {emptyHint}
        </div>
      ) : null}
    </div>
  );
}

function MapPinChip({ label }: { label: string }) {
  return (
    <div className="-translate-y-1 flex flex-col items-center gap-1">
      <span className="relative inline-flex items-center gap-1.5 rounded-full border border-[#b8d3c5]/40 bg-[#07100d]/85 px-2.5 py-1 text-[11px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <MapPin className="size-3 text-[#b8d3c5]" aria-hidden="true" />
        {label}
      </span>
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-[#b8d3c5] shadow-[0_0_0_4px_rgba(184,211,197,0.25),0_0_18px_rgba(184,211,197,0.6)]"
      />
    </div>
  );
}

function FallbackMap() {
  // Sage-tinted topo-ish background used when no Mapbox token is configured.
  // Keeps the onboarding renderable but is intentionally less impressive than
  // the real map so the missing token is visible.
  return (
    <div className="relative size-full">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 35%, rgba(184,211,197,0.28), transparent 55%),"
            + "radial-gradient(circle at 75% 70%, rgba(216,196,135,0.18), transparent 60%),"
            + "linear-gradient(180deg, #0c1612 0%, #07100d 100%)",
        }}
      />
      <svg
        viewBox="0 0 360 280"
        className="absolute inset-0 size-full text-[#b8d3c5]/22"
        aria-hidden="true"
      >
        <path d="M0 200 C70 160 120 80 200 105 C265 125 295 75 360 90" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M0 150 C60 175 130 130 200 150 C260 170 300 220 360 200" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <path d="M0 80 C70 110 145 85 220 105 C275 120 310 80 360 95" fill="none" stroke="currentColor" strokeWidth="0.9" />
      </svg>
    </div>
  );
}
