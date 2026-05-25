"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Grid2X2, Play, View, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";

/**
 * Discriminated union over every kind of media a listing can show.
 * `photos: string[]` on PublicListingCardData remains the backward-compat
 * path — callers without a curated media list pass `photosToMedia(photos)`
 * and get a sensible default. New surfaces should populate `media` directly
 * so we keep the door open for videos + virtual tours per listing.
 */
export type ListingMedia =
  | { kind: "photo"; url: string; alt?: string }
  | { kind: "video"; url: string; thumbnail: string; alt?: string }
  | { kind: "virtual_tour"; url: string; thumbnail?: string; provider?: string; alt?: string };

export function photosToMedia(photos: readonly string[]): ListingMedia[] {
  return photos
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    .map((url) => ({ kind: "photo", url } satisfies ListingMedia));
}

function mediaThumbnail(item: ListingMedia): string {
  if (item.kind === "photo") return item.url;
  if (item.kind === "video") return item.thumbnail;
  return item.thumbnail ?? "";
}

function mediaAlt(item: ListingMedia, index: number): string {
  return item.alt ?? `Listing media ${index + 1}`;
}

function photoCountOf(items: readonly ListingMedia[]): number {
  return items.filter((item) => item.kind === "photo").length;
}

function virtualTourFrom(items: readonly ListingMedia[]): ListingMedia | null {
  return items.find((item): item is Extract<ListingMedia, { kind: "virtual_tour" }> => item.kind === "virtual_tour") ?? null;
}

/**
 * The lightbox: fullscreen swipeable viewer for one media item at a time.
 * Photos render inline; videos render in a native <video> player; virtual
 * tours render in an iframe (with a fallback "open in new tab" so embeds
 * that disallow iframes still work).
 *
 * Keyboard: ←/→ navigate, Esc closes. Touch: horizontal swipe navigates.
 */
function Lightbox(props: {
  items: readonly ListingMedia[];
  index: number;
  onClose: () => void;
  onChange: (index: number) => void;
}) {
  const { items, index, onClose, onChange } = props;

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onChange(Math.min(index + 1, items.length - 1));
      if (event.key === "ArrowLeft") onChange(Math.max(index - 1, 0));
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [index, items.length, onChange, onClose]);

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX === null) return;
    const dx = event.changedTouches[0]?.clientX === undefined
      ? 0
      : event.changedTouches[0].clientX - touchStartX;
    // 60px threshold matches Bloc + iOS native gallery feel.
    if (Math.abs(dx) > 60) {
      onChange(dx < 0
        ? Math.min(index + 1, items.length - 1)
        : Math.max(index - 1, 0));
    }
    setTouchStartX(null);
  }

  const current = items[index];
  if (current === undefined) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="listing media viewer"
      className="fixed inset-0 z-[70] flex flex-col bg-black/95"
      onClick={onClose}
      onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-between px-5 py-4 text-white">
        <div className="text-[12px] font-medium tabular-nums text-white/72">
          {index + 1} / {items.length}
        </div>
        <button
          aria-label="close gallery"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-white/[0.06] text-white/80 transition hover:border-white/24 hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center" onClick={(event) => event.stopPropagation()}>
        {current.kind === "photo" ? (
          <img
            alt={mediaAlt(current, index)}
            className="max-h-full max-w-full object-contain"
            src={current.url}
          />
        ) : current.kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            className="max-h-full max-w-full"
            controls
            poster={current.thumbnail}
            src={current.url}
          />
        ) : (
          <iframe
            allowFullScreen
            className="h-full w-full"
            src={current.url}
            title={mediaAlt(current, index)}
          />
        )}

        {/* Prev / next arrows — hidden on mobile, swipe handles it there */}
        {index === 0 ? null : (
          <button
            aria-label="previous media"
            className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/14 bg-white/[0.06] text-white/80 transition hover:border-white/24 hover:text-white md:flex"
            onClick={(event) => {
              event.stopPropagation();
              onChange(index - 1);
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
        )}
        {index === items.length - 1 ? null : (
          <button
            aria-label="next media"
            className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/14 bg-white/[0.06] text-white/80 transition hover:border-white/24 hover:text-white md:flex"
            onClick={(event) => {
              event.stopPropagation();
              onChange(index + 1);
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Fullscreen "all photos" grid (Airbnb pattern). Tap any cell to open
 * the lightbox at that index.
 */
function GridView(props: {
  items: readonly ListingMedia[];
  onClose: () => void;
  onOpenLightbox: (index: number) => void;
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [props]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="all listing media"
      className="fixed inset-0 z-[65] flex flex-col bg-[#0a0f0c]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="font-display text-[18px] font-medium lowercase text-white">all media · {props.items.length}</div>
        <button
          aria-label="close media grid"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-white/22 hover:text-white"
          onClick={props.onClose}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-12 pt-4">
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-3 md:grid-cols-3">
          {props.items.map((item, index) => (
            <button
              className="group relative aspect-[4/3] overflow-hidden rounded-[18px] border border-white/10 bg-black/40"
              key={`${item.kind}-${index}`}
              onClick={() => props.onOpenLightbox(index)}
              type="button"
            >
              {mediaThumbnail(item).length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-white/40">
                  <View aria-hidden="true" className="h-6 w-6" />
                </div>
              ) : (
                <img
                  alt={mediaAlt(item, index)}
                  className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.03]"
                  src={mediaThumbnail(item)}
                />
              )}
              {item.kind === "video" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/92 text-[#07100a] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                    <Play aria-hidden="true" className="ml-0.5 h-5 w-5 fill-current" />
                  </span>
                </div>
              ) : null}
              {item.kind === "virtual_tour" ? (
                <div className="absolute inset-x-2 bottom-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                  <View aria-hidden="true" className="h-3.5 w-3.5" />
                  virtual tour
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ListingMediaGallery(props: {
  media: readonly ListingMedia[];
  listingLabel: string;
}) {
  const { media } = props;
  const [overlay, setOverlay] = useState<"none" | "grid" | "lightbox">("none");
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const hero = media[0];
  const photoCount = useMemo(() => photoCountOf(media), [media]);
  const tour = useMemo(() => virtualTourFrom(media), [media]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setOverlay("lightbox");
  }, []);

  if (hero === undefined) {
    return (
      <div className="mx-4 flex h-[260px] items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] text-white/40">
        <View aria-hidden="true" className="h-7 w-7" strokeWidth={1.6} />
      </div>
    );
  }

  // Thumb strip — second+ items, max 8 in the inline strip; everything else
  // accessible through "view all". On desktop this lays out as a 2x4 grid;
  // on mobile it scroll-snaps horizontally for a swipe feel.
  const stripItems = media.slice(1, 9);

  return (
    <>
      <div className="mx-4 overflow-hidden rounded-[24px] bg-black/40">
        <button
          aria-label={`open ${props.listingLabel} gallery`}
          className="group relative block h-[280px] w-full sm:h-[340px]"
          onClick={() => openLightbox(0)}
          type="button"
        >
          {hero.kind === "photo" || hero.kind === "video" ? (
            <img
              alt={mediaAlt(hero, 0)}
              className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              src={hero.kind === "photo" ? hero.url : hero.thumbnail}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_35%_20%,rgba(136,162,118,0.22),transparent_40%),linear-gradient(135deg,#16241b,#0c130e)]">
              <View aria-hidden="true" className="h-10 w-10 text-white/45" strokeWidth={1.5} />
            </div>
          )}
          {hero.kind === "video" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/92 text-[#07100a] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                <Play aria-hidden="true" className="ml-0.5 h-6 w-6 fill-current" />
              </span>
            </div>
          ) : null}
          <div className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
            <Grid2X2 aria-hidden="true" className="h-3.5 w-3.5" />
            {photoCount} photo{photoCount === 1 ? "" : "s"}
          </div>
          {tour === null ? null : (
            <a
              className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-1.5 text-[11px] font-semibold text-[#07100a] shadow-[0_8px_22px_rgba(0,0,0,0.25)] transition hover:bg-white"
              href={tour.url}
              onClick={(event) => event.stopPropagation()}
              rel="noopener noreferrer"
              target="_blank"
            >
              <View aria-hidden="true" className="h-3.5 w-3.5" />
              take the 3d tour
              <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
            </a>
          )}
        </button>
      </div>

      {/* Thumb strip below hero — only when there's more than one item */}
      {stripItems.length === 0 ? null : (
        <div className="mt-3 px-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible">
            {stripItems.map((item, index) => (
              <button
                aria-label={`open media ${index + 2}`}
                className={cn(
                  "group relative h-[72px] w-[100px] shrink-0 overflow-hidden rounded-[12px] border border-white/8 bg-black/40",
                  "sm:h-auto sm:w-auto sm:aspect-[4/3]",
                )}
                key={`thumb-${index}`}
                onClick={() => openLightbox(index + 1)}
                type="button"
              >
                {mediaThumbnail(item).length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-white/30">
                    <View aria-hidden="true" className="h-4 w-4" />
                  </div>
                ) : (
                  <img
                    alt={mediaAlt(item, index + 1)}
                    className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.04]"
                    src={mediaThumbnail(item)}
                  />
                )}
                {item.kind === "video" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/92 text-[#07100a]">
                      <Play aria-hidden="true" className="ml-0.5 h-3.5 w-3.5 fill-current" />
                    </span>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
          {media.length > 1 ? (
            <button
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium lowercase text-white/82 transition hover:border-white/22 hover:bg-white/[0.06]"
              onClick={() => setOverlay("grid")}
              type="button"
            >
              <Grid2X2 aria-hidden="true" className="h-3.5 w-3.5" />
              view all {media.length}
            </button>
          ) : null}
        </div>
      )}

      {overlay === "grid" ? (
        <GridView
          items={media}
          onClose={() => setOverlay("none")}
          onOpenLightbox={(index) => openLightbox(index)}
        />
      ) : null}
      {overlay === "lightbox" ? (
        <Lightbox
          index={lightboxIndex}
          items={media}
          onChange={setLightboxIndex}
          onClose={() => setOverlay("none")}
        />
      ) : null}
    </>
  );
}
