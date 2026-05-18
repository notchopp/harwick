"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { MapPin, Search, X } from "lucide-react";
import MapboxMap, {
  type MapRef,
  Marker,
  type ViewState,
} from "react-map-gl/mapbox";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MAPBOX_TOKEN = process.env["NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"];
const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

const DEFAULT_VIEW: Pick<ViewState, "longitude" | "latitude" | "zoom"> = {
  longitude: -97.5,
  latitude: 37.5,
  zoom: 3.2,
};

const PLACE_TYPES = "place,locality,neighborhood,postcode,district";

export type ResolvedArea = {
  query: string;
  placeName: string;
  longitude: number;
  latitude: number;
};

type MapboxFeature = {
  id?: string;
  place_name?: string;
  text?: string;
  center?: [number, number];
};

export async function searchAreas(query: string): Promise<ResolvedArea[]> {
  if (MAPBOX_TOKEN === undefined || query.trim().length < 2) return [];
  try {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
    );
    url.searchParams.set("access_token", MAPBOX_TOKEN);
    url.searchParams.set("limit", "5");
    url.searchParams.set("types", PLACE_TYPES);
    url.searchParams.set("country", "us");
    url.searchParams.set("autocomplete", "true");
    const response = await fetch(url.toString());
    if (!response.ok) return [];
    const data = (await response.json()) as { features?: MapboxFeature[] };
    const features = data.features ?? [];
    return features
      .filter((feature) => feature.center !== undefined && feature.place_name !== undefined)
      .map((feature) => ({
        query,
        placeName: feature.place_name ?? "",
        longitude: feature.center![0],
        latitude: feature.center![1],
      }));
  } catch {
    return [];
  }
}

async function geocodeArea(query: string): Promise<ResolvedArea | null> {
  const results = await searchAreas(query);
  return results[0] ?? null;
}

type MarketMapProps = {
  areas: ReadonlyArray<string>;
  resolvedAreas?: ReadonlyMap<string, ResolvedArea>;
  onResolve?: (resolved: ResolvedArea) => void;
};

export function MarketMap({ areas, resolvedAreas, onResolve }: MarketMapProps) {
  const [geocoded, setGeocoded] = useState<ResolvedArea[]>([]);
  const cacheRef = useRef(new Map<string, ResolvedArea | null>());
  const mapRef = useRef<MapRef | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;

    if (resolvedAreas !== undefined) {
      for (const [key, value] of resolvedAreas.entries()) {
        if (!cache.has(key)) cache.set(key, value);
      }
    }

    async function resolveAll() {
      const resolved: ResolvedArea[] = [];
      for (const area of areas) {
        const cached = cache.get(area);
        if (cached !== undefined) {
          if (cached !== null) resolved.push(cached);
          continue;
        }
        const result = await geocodeArea(area);
        cache.set(area, result);
        if (result !== null) {
          resolved.push(result);
          onResolve?.(result);
        }
        if (cancelled) return;
      }
      if (!cancelled) setGeocoded(resolved);
    }

    void resolveAll();
    return () => {
      cancelled = true;
    };
  }, [areas, resolvedAreas, onResolve]);

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
    if (!mapAvailable) return null;
    if (areas.length === 0) return "Add an area to drop the first pin.";
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

type AreaSearchInputProps = {
  placeholder?: string;
  excludeKeys?: ReadonlyArray<string>;
  onSelect: (resolved: ResolvedArea) => void;
};

export function AreaSearchInput({ placeholder, excludeKeys, onSelect }: AreaSearchInputProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ResolvedArea[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const excludeSet = useMemo(() => new Set(excludeKeys ?? []), [excludeKeys]);

  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await searchAreas(query);
      const filtered = results.filter((entry) => !excludeSet.has(entry.placeName));
      setSuggestions(filtered);
      setActiveIndex(0);
    }, 180);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [query, excludeSet]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (containerRef.current === null) return;
      if (!containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, []);

  const handleSelect = useCallback(
    (resolved: ResolvedArea) => {
      onSelect(resolved);
      setQuery("");
      setSuggestions([]);
      setIsOpen(false);
    },
    [onSelect],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      setIsOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      setIsOpen(true);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const choice = suggestions[activeIndex];
      if (choice !== undefined) handleSelect(choice);
    }
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-white/35" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Search for a city, neighborhood, or zip"}
          className="h-11 w-full rounded-[12px] border border-white/12 bg-white/[0.05] pl-9 pr-3 text-[13.5px] text-white outline-none transition placeholder:text-white/35 focus:border-[#b8d3c5]/55 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(184,211,197,0.18)]"
          autoComplete="off"
          spellCheck={false}
        />
        {query.length > 0 ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/45 transition hover:bg-white/5 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {isOpen && suggestions.length > 0 ? (
        <ul className="absolute left-0 right-0 bottom-[calc(100%+6px)] z-30 max-h-[260px] overflow-y-auto rounded-[14px] border border-white/12 bg-[#0c1014] py-1 shadow-[0_-30px_60px_-20px_rgba(0,0,0,0.7)]">
          {suggestions.map((entry, index) => {
            const isActive = index === activeIndex;
            const primary = entry.placeName.split(",")[0] ?? entry.placeName;
            const rest = entry.placeName.includes(",")
              ? entry.placeName.slice(entry.placeName.indexOf(",") + 1).trim()
              : "";
            return (
              <li key={`${entry.placeName}-${index}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(entry)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition ${
                    isActive ? "bg-white/[0.06]" : "bg-transparent"
                  }`}
                >
                  <MapPin
                    aria-hidden="true"
                    className={`mt-0.5 size-3.5 shrink-0 ${
                      isActive ? "text-[#b8d3c5]" : "text-white/45"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-white">{primary}</div>
                    {rest.length > 0 ? (
                      <div className="truncate text-[11.5px] text-white/45">{rest}</div>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
