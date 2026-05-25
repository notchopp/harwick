"use client";

import type { HTMLAttributes, ReactNode } from "react";
import type { IconType } from "react-icons";
import { Fragment, useState } from "react";
import {
  PiBathtubFill,
  PiBedFill,
  PiBuildingApartmentFill,
  PiCalendarBlankFill,
  PiCarFill,
  PiCaretRightBold,
  PiCurrencyDollarSimpleFill,
  PiDotsThreeBold,
  PiHouseFill,
  PiMapPinFill,
  PiRulerFill,
  PiTagFill,
  PiUsersThreeFill,
  PiWavesFill,
} from "react-icons/pi";

import { cn } from "../../lib/utils";

/**
 * Bloc-inspired listing bits. Bottom-drawer fact rows, inline expanders,
 * status dots, eyebrow labels, live preview card. Real Phosphor glyphs.
 *
 * Visual rules:
 *  - Surfaces use `var(--panel-1/2/3)` so they live inside the Harwick panel system.
 *  - Eyebrows are uppercase 10px tracking-[0.18em] faint.
 *  - Fact rows are full-width: [icon tile][label/value][caret]. Tap to expand inline.
 *  - Status dot is a single colored dot, never a pill.
 *  - Real per-thing icons — bed for beds, bath for baths, map pin for location, etc.
 */

/** Listing market status (active / pending / sold). Single colored dot + label. */
type MarketStatus = "active" | "pending" | "sold";
type Verification = "verified" | "needs_recheck" | "unverified";

const MARKET_DOT: Record<MarketStatus, string> = {
  active: "bg-[var(--sage,#88a276)]",
  pending: "bg-[var(--clay,#c4865c)]",
  sold: "bg-[var(--graphite-text-faint,rgba(255,255,255,0.34))]",
};

const VERIFICATION_DOT: Record<Verification, string> = {
  verified: "bg-[var(--sage,#88a276)]",
  needs_recheck: "bg-[var(--oxblood,#b8534b)]",
  unverified: "bg-[var(--graphite-text-faint,rgba(255,255,255,0.34))]",
};

/** Uppercase tracked eyebrow above a section. */
export function SectionEyebrow({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--graphite-text-faint)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Single colored dot + label. Replaces pill chips for status. */
export function StatusDot(props: { status: MarketStatus; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium lowercase text-white/82", props.className)}>
      <span className={cn("h-2 w-2 rounded-full", MARKET_DOT[props.status])} />
      {props.label}
    </span>
  );
}

/** Single colored dot + label for verification state. */
export function VerificationDot(props: { status: Verification; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium lowercase text-white/64", props.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", VERIFICATION_DOT[props.status])} />
      {props.label}
    </span>
  );
}

/** Real-icon registry for listing facts. */
export const FACT_ICONS = {
  beds: PiBedFill,
  baths: PiBathtubFill,
  sqft: PiRulerFill,
  lotSize: PiRulerFill,
  yearBuilt: PiCalendarBlankFill,
  hoa: PiCurrencyDollarSimpleFill,
  parking: PiCarFill,
  pool: PiWavesFill,
  location: PiMapPinFill,
  propertyType: PiHouseFill,
  apartment: PiBuildingApartmentFill,
  status: PiTagFill,
  crowd: PiUsersThreeFill,
} as const;

type FieldRowProps = {
  icon: IconType;
  label: string;
  value: string | null;
  hint?: string;
  caretRotated?: boolean;
  onPress?: () => void;
  children?: ReactNode;
};

/**
 * Bloc fact-row pattern. Icon tile + label/value column + caret right.
 * Tap → optional `children` unfurl as inline expander INSIDE the same group.
 * Never opens a separate sheet, never navigates away.
 */
export function FieldRow({ icon: Icon, label, value, hint, caretRotated, onPress, children }: FieldRowProps) {
  const isInteractive = onPress !== undefined;
  return (
    <Fragment>
      <button
        type="button"
        onClick={onPress}
        disabled={!isInteractive}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition",
          isInteractive ? "hover:bg-white/[0.04] active:bg-white/[0.06]" : "cursor-default",
        )}
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/14 bg-white/[0.06] text-[color:var(--sage,#88a276)]"
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-semibold lowercase text-white/92">{label}</span>
          <span
            className={cn(
              "truncate text-[12px] lowercase",
              value === null || value.length === 0
                ? "text-white/32"
                : "text-white/68",
            )}
          >
            {value === null || value.length === 0 ? (hint ?? "—") : value}
          </span>
        </span>
        {isInteractive ? (
          <PiCaretRightBold
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-white/40 transition-transform",
              caretRotated ? "rotate-90" : null,
            )}
          />
        ) : null}
      </button>
      {children !== undefined ? (
        <div className="border-t border-white/6 bg-white/[0.025] px-4 py-3.5">{children}</div>
      ) : null}
    </Fragment>
  );
}

/** Hairline divider scoped to FieldRowGroup. Indented past the icon tile. */
export function FieldRowDivider() {
  return <div className="ml-[64px] h-px bg-white/6" />;
}

/** Rounded panel that holds a vertical stack of FieldRows with hairline dividers. */
export function FieldRowGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.03]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A stepped number input — replaces the raw <input type="number"> for crowd, price, sqft. */
export function NumberStepper(props: {
  value: number | null;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number | ((current: number) => number);
  formatValue?: (value: number) => string;
  defaultValue?: number;
}) {
  const min = props.min ?? 0;
  const max = props.max ?? 10_000_000;
  const current = props.value ?? props.defaultValue ?? Math.max(0, min);
  const stepSize = typeof props.step === "function" ? props.step(current) : (props.step ?? 1);
  const label = props.formatValue?.(current) ?? String(current);

  return (
    <div className="flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={() => props.onChange(Math.max(min, current - stepSize))}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/[0.05] text-[18px] font-semibold text-white/82 transition hover:border-white/24 hover:bg-white/[0.08]"
        aria-label="decrease"
      >
        −
      </button>
      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="font-display text-[26px] font-semibold tracking-[-0.02em] text-white">
          {label}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
          tap ± to adjust
        </div>
      </div>
      <button
        type="button"
        onClick={() => props.onChange(Math.min(max, current + stepSize))}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/[0.05] text-[18px] font-semibold text-white/82 transition hover:border-white/24 hover:bg-white/[0.08]"
        aria-label="increase"
      >
        +
      </button>
    </div>
  );
}

/** Free-text expander — replaces the raw text input row with a one-line input + done affordance. */
export function InlineTextEditor(props: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onCommit?: () => void;
}) {
  return (
    <input
      type="text"
      autoFocus={props.autoFocus}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      onKeyDown={(event) => {
        if (event.key === "Enter" && props.onCommit !== undefined) {
          event.preventDefault();
          props.onCommit();
        }
      }}
      className="w-full rounded-[12px] border border-white/16 bg-white/[0.05] px-3.5 py-2.5 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.07] focus:ring-2 focus:ring-[var(--sage,#88a276)]/30"
    />
  );
}

/** Two-action ghost-row useful for chips like incentives that turn into editable list. */
export function ChipInputEditor(props: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (props.values.includes(trimmed)) {
      setDraft("");
      return;
    }
    props.onChange([...props.values, trimmed]);
    setDraft("");
  };
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {props.values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium lowercase text-white/82"
          >
            {value}
            <button
              type="button"
              onClick={() => props.onChange(props.values.filter((entry) => entry !== value))}
              className="text-white/40 hover:text-white"
              aria-label={`remove ${value}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <InlineTextEditor
          value={draft}
          onChange={setDraft}
          {...(props.placeholder === undefined ? {} : { placeholder: props.placeholder })}
          onCommit={add}
        />
        <button
          type="button"
          onClick={add}
          disabled={draft.trim().length === 0}
          className="inline-flex items-center gap-1 rounded-full border border-white/14 bg-white/[0.06] px-3 text-[12px] font-semibold lowercase text-white/82 transition hover:border-white/24 disabled:opacity-40"
        >
          add
        </button>
      </div>
    </div>
  );
}

type LivePreviewProps = {
  workspaceName: string;
  address: string;
  price: string;
  priceValue: number | null;
  neighborhood: string;
  beds: string;
  baths: string;
  squareFeet: string;
  propertyType: string;
  hasPool: boolean;
  notes: string;
  photoUrl: string;
  marketStatus: MarketStatus;
};

/**
 * Live listing card preview — mirrors what the public listing card looks like.
 * Updates as the operator fills the form. This is the bloc "compose the deliverable
 * inside the drawer" principle.
 */
export function LiveListingPreview(props: LivePreviewProps) {
  const priceLine = props.price.length > 0
    ? props.price
    : props.priceValue !== null && props.priceValue > 0
      ? formatPrice(props.priceValue)
      : "price on request";
  const addressLine = props.address.length > 0 ? props.address : "address";
  const neighborhood = props.neighborhood.length > 0 ? props.neighborhood : "neighborhood";
  const beds = props.beds.length > 0 ? props.beds : "—";
  const baths = props.baths.length > 0 ? props.baths : "—";
  const sqftRaw = Number(props.squareFeet.replace(/[^0-9.]/g, ""));
  const sqftLabel = props.squareFeet.length > 0 && Number.isFinite(sqftRaw)
    ? `${Math.round(sqftRaw).toLocaleString()} sqft`
    : "sqft —";
  const propertyType = props.propertyType.length > 0 ? props.propertyType : "home";

  const statusLabel = props.marketStatus === "active"
    ? "active"
    : props.marketStatus === "pending"
      ? "pending"
      : "sold";

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-[24px] border border-white/10 bg-[#07100a] shadow-[0_30px_72px_-20px_rgba(6,12,8,0.6)]">
      {props.photoUrl.length > 0 ? (
        <img
          src={props.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(9,49,31,0.94), rgba(16,24,20,0.96), rgba(62,115,92,0.7))",
          }}
        />
      )}

      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 12%, rgba(255,255,255,0.08), transparent 28%), linear-gradient(180deg, rgba(7,15,10,0.04) 0%, rgba(7,15,10,0.18) 34%, rgba(7,15,10,0.92) 100%)",
        }}
      />

      <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-2">
        <StatusDot status={props.marketStatus} label={statusLabel} className="rounded-full border border-white/14 bg-black/40 px-3 py-1.5 text-white/88 backdrop-blur-md" />
        <span className="rounded-full border border-white/14 bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/82 backdrop-blur-md">
          {props.workspaceName}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <div className="rounded-[18px] border border-white/12 bg-[#07100a]/68 p-4 backdrop-blur-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-end gap-2">
            <div className="font-display text-[26px] font-semibold leading-none tracking-[-0.02em]">{priceLine}</div>
            <div className="pb-0.5 text-[11px] lowercase text-white/52">list price</div>
          </div>
          <div className="mt-2 truncate text-[14px] font-medium text-white/92">{addressLine}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] lowercase text-white/56">
            <PiMapPinFill className="h-3 w-3" />
            <span className="truncate">{neighborhood}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2.5 text-[11px] lowercase">
            <div className="flex items-center gap-1.5 text-white/82">
              <PiBedFill className="h-3.5 w-3.5 text-[color:var(--sage,#88a276)]" />
              <span>{beds} bd</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/82">
              <PiBathtubFill className="h-3.5 w-3.5 text-[color:var(--sage,#88a276)]" />
              <span>{baths} ba</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/82">
              <PiRulerFill className="h-3.5 w-3.5 text-[color:var(--sage,#88a276)]" />
              <span>{sqftLabel}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-medium lowercase text-white/64">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
              <PiHouseFill className="h-3 w-3" />
              {propertyType}
            </span>
            {props.hasPool ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                <PiWavesFill className="h-3 w-3" />
                pool
              </span>
            ) : null}
          </div>
          {props.notes.length > 0 ? (
            <div className="mt-3 line-clamp-2 text-[11px] leading-5 text-white/64">{props.notes}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatPrice(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m.toFixed(value % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  }
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value}`;
}

/** Three-dot kebab trigger glyph. */
export const KebabIcon = PiDotsThreeBold;
