"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  ImageIcon,
  List,
  Loader2,
  X,
} from "lucide-react";
import {
  PiArrowSquareOutBold,
  PiArrowsClockwiseBold,
  PiCheckCircleFill,
  PiClockFill,
  PiDotsThreeBold,
  PiGlobeBold,
  PiHouseFill,
  PiMapPinFill,
  PiPencilSimpleBold,
  PiPlusBold,
  PiShareNetworkBold,
  PiUploadSimpleBold,
} from "react-icons/pi";
import type { ListingUrlImportDraft, ManualListingFactRequest } from "@realty-ops/core";
import { Drawer } from "vaul";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import type { ListingFactRow } from "../../lib/supabase/listings";
import { cn } from "../../lib/utils";
import {
  filterListingsCards,
  mapListingFactRowToCard,
  type ListingsStatusFilter,
} from "./listings-data";
import {
  ChipInputEditor,
  FACT_ICONS,
  FieldRow,
  FieldRowDivider,
  FieldRowGroup,
  InlineTextEditor,
  LiveListingPreview,
  NumberStepper,
  SectionEyebrow,
  StatusDot,
  VerificationDot,
} from "./listing-bits";

type ListingsPageContentProps = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
};

type EditorFormState = {
  address: string;
  status: string;
  price: string;
  beds: string;
  baths: string;
  squareFeet: string;
  neighborhood: string;
  propertyType: string;
  photoUrl: string;
  videoUrl: string;
  mediaUrls: string;
  notes: string;
  incentives: string;
  hasPool: boolean;
};

type ApiActionState = {
  tone: "default" | "error";
  message: string;
};

type ListingsViewMode = "cards" | "list";
type EditorFactId =
  | "address"
  | "status"
  | "price"
  | "beds"
  | "baths"
  | "squareFeet"
  | "neighborhood"
  | "propertyType"
  | "incentives";

type UploadedListingMedia = {
  kind: "image" | "video";
  name: string;
  path: string;
  url: string;
};

function emptyEditor(): EditorFormState {
  return {
    address: "",
    status: "Active",
    price: "",
    beds: "",
    baths: "",
    squareFeet: "",
    neighborhood: "",
    propertyType: "",
    photoUrl: "",
    videoUrl: "",
    mediaUrls: "",
    notes: "",
    incentives: "",
    hasPool: false,
  };
}

function editorFromRow(row: ListingFactRow): EditorFormState {
  const rawFacts = row.raw_facts;
  const squareFeet = rawFacts["squareFeet"];
  const neighborhood = rawFacts["neighborhood"];
  const propertyType = rawFacts["propertyType"];
  const photoUrl = rawFacts["photoUrl"];
  const videoUrl = rawFacts["videoUrl"];
  const mediaUrls = rawFacts["mediaUrls"];
  const notes = rawFacts["notes"];
  const incentives = rawFacts["incentives"];

  return {
    address: row.address,
    status: row.status ?? "Active",
    price: row.price === null ? "" : String(row.price),
    beds: row.beds === null ? "" : String(row.beds),
    baths: row.baths === null ? "" : String(row.baths),
    squareFeet: typeof squareFeet === "number" ? String(squareFeet) : "",
    neighborhood: typeof neighborhood === "string" ? neighborhood : "",
    propertyType: typeof propertyType === "string" ? propertyType : "",
    photoUrl: typeof photoUrl === "string" ? photoUrl : "",
    videoUrl: typeof videoUrl === "string" ? videoUrl : "",
    mediaUrls: Array.isArray(mediaUrls)
      ? mediaUrls.filter((value): value is string => typeof value === "string").join("\n")
      : "",
    notes: typeof notes === "string" ? notes : "",
    incentives: Array.isArray(incentives)
      ? incentives.filter((value): value is string => typeof value === "string").join(", ")
      : "",
    hasPool: row.has_pool ?? false,
  };
}

function parseNumberField(value: string): number | undefined {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (normalized.length === 0) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildListingRequest(editor: EditorFormState) {
  return {
    address: editor.address.trim(),
    status: editor.status.trim() || "Active",
    price: parseNumberField(editor.price),
    beds: parseNumberField(editor.beds),
    baths: parseNumberField(editor.baths),
    squareFeet: parseNumberField(editor.squareFeet),
    neighborhood: editor.neighborhood.trim() || undefined,
    propertyType: editor.propertyType.trim() || undefined,
    photoUrl: editor.photoUrl.trim() || undefined,
    videoUrl: editor.videoUrl.trim() || undefined,
    mediaUrls: editor.mediaUrls
      .split(/\n|,/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    notes: editor.notes.trim() || undefined,
    incentives: editor.incentives
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    hasPool: editor.hasPool,
  };
}

function formatCompactPrice(value: number | null): string {
  if (value === null || value <= 0) {
    return "price not set";
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${millions.toFixed(value % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }
  return `$${value}`;
}

function formatNumberLabel(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function editorMarketStatus(status: string): "active" | "pending" | "sold" {
  const normalized = status.trim().toLowerCase();
  if (/(sold|closed|off market)/.test(normalized)) {
    return "sold";
  }
  if (/(pending|under contract|contingent)/.test(normalized)) {
    return "pending";
  }
  return "active";
}

function isListingFactRow(value: unknown): value is ListingFactRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record["id"] === "string"
    && typeof record["workspace_id"] === "string"
    && typeof record["source"] === "string"
    && typeof record["address"] === "string"
    && typeof record["verification_status"] === "string"
    && typeof record["raw_facts"] === "object"
    && record["raw_facts"] !== null
    && typeof record["created_at"] === "string"
    && typeof record["updated_at"] === "string";
}

function parseListingsResponse(payload: unknown): ListingFactRow[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const listings = (payload as Record<string, unknown>)["listings"];
  if (!Array.isArray(listings)) {
    return [];
  }

  return listings.filter(isListingFactRow);
}

function formatErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null) {
    return fallback;
  }

  const error = (payload as Record<string, unknown>)["error"];
  return typeof error === "string" && error.trim().length > 0 ? error : fallback;
}

function parseUploadedListingMedia(payload: unknown): UploadedListingMedia[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const media = (payload as Record<string, unknown>)["media"];
  if (!Array.isArray(media)) {
    return [];
  }

  return media.filter((entry): entry is UploadedListingMedia => {
    if (typeof entry !== "object" || entry === null) {
      return false;
    }
    const record = entry as Record<string, unknown>;
    return (record["kind"] === "image" || record["kind"] === "video")
      && typeof record["name"] === "string"
      && typeof record["path"] === "string"
      && typeof record["url"] === "string";
  });
}

async function readJsonPayload(response: Response): Promise<unknown> {
  return response.json().then((value: unknown) => value).catch(() => null);
}

const filterOptions: Array<{ value: ListingsStatusFilter; label: string }> = [
  { value: "all", label: "all inventory" },
  { value: "active", label: "active" },
  { value: "pending", label: "pending" },
  { value: "sold", label: "sold" },
  { value: "recheck", label: "needs recheck" },
];

const listingsPageSize = 12;

function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(page, 1), Math.max(pageCount, 1));
}

const starterListingCards = [
  {
    title: "cover media",
    label: "upload photos",
    meta: "the first image becomes the listing card",
    gradient: "from-[#13251a] via-[#2f3b28] to-[#07100a]",
  },
  {
    title: "listing facts",
    label: "price, beds, baths",
    meta: "facts power replies, routing, and verification",
    gradient: "from-[#172c24] via-[#354536] to-[#0b130e]",
  },
  {
    title: "public card",
    label: "ready to send",
    meta: "Harwick can share this with leads in conversation",
    gradient: "from-[#322812] via-[#4a3d1f] to-[#0c0b07]",
  },
] as const;

function StarterGlassListingCard(props: {
  label: string;
  meta: string;
  title: string;
  gradient: string;
  onAddListing: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onAddListing}
      className="group relative min-h-[430px] overflow-hidden rounded-[30px] bg-harwick-ink text-left shadow-[0_34px_92px_rgba(18,26,20,0.16)] ring-1 ring-black/[0.05] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_38px_88px_rgba(18,26,20,0.2)]"
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br", props.gradient)} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.16),transparent_32%),radial-gradient(circle_at_80%_92%,rgba(99,132,75,0.44),transparent_36%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,15,10,0.02)_0%,rgba(7,15,10,0.08)_38%,rgba(7,15,10,0.78)_100%)]" />
      <div className="absolute left-5 top-5 rounded-full border border-white/16 bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-white/88 shadow-[0_14px_32px_rgba(14,18,15,0.14)] backdrop-blur-md">
        {props.label}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6 text-white">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(circle_at_30%_70%,rgba(86,112,45,0.34),transparent_42%),linear-gradient(180deg,transparent_0%,rgba(8,17,10,0.82)_100%)]" />
        <div className="relative rounded-[24px] border border-white/10 bg-white/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_-24px_70px_rgba(6,12,8,0.15)] backdrop-blur-[10px]">
          <div className="mb-2 flex items-end gap-2">
            <div className="font-display text-[31px] font-medium leading-none">{props.title}</div>
          </div>
          <div className="max-w-[82%] text-[15px] font-medium leading-5 text-white/74">{props.meta}</div>
          <div className="my-4 h-px bg-white/16" />
          <div className="flex items-center justify-between gap-3 text-[12px] text-white/56">
            <span>create inventory</span>
            <span className="rounded-full bg-white/12 px-3 py-1 text-white/82 transition group-hover:bg-white/18">
              add listing
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function PaginationFooter(props: {
  currentPage: number;
  itemCount: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = props.itemCount === 0 ? 0 : (props.currentPage - 1) * props.pageSize + 1;
  const end = Math.min(props.itemCount, props.currentPage * props.pageSize);

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] px-4 py-3 text-[12px] text-[color:var(--graphite-text-muted)] shadow-[var(--panel-inset-top-soft)] sm:flex-row sm:items-center sm:justify-between">
      <div className="lowercase">
        showing {start}-{end} of {props.itemCount}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={props.currentPage <= 1}
          onClick={() => props.onPageChange(props.currentPage - 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-3 text-[12px] font-medium lowercase text-[color:var(--graphite-text-muted)] shadow-[var(--panel-inset-top-soft)] transition hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          prev
        </button>
        <span className="min-w-20 text-center text-[11px] lowercase text-[color:var(--graphite-text-faint)]">
          page {props.currentPage} / {props.pageCount}
        </span>
        <button
          type="button"
          disabled={props.currentPage >= props.pageCount}
          onClick={() => props.onPageChange(props.currentPage + 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-3 text-[12px] font-medium lowercase text-[color:var(--graphite-text-muted)] shadow-[var(--panel-inset-top-soft)] transition hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ListingsPageContent({ workspaceId, workspaceName, workspaceSlug }: ListingsPageContentProps) {
  const [rows, setRows] = useState<ListingFactRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionState, setActionState] = useState<ApiActionState | null>(null);
  const [statusFilter, setStatusFilter] = useState<ListingsStatusFilter>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ListingsViewMode>("list");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorListingId, setEditorListingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorFormState>(emptyEditor);
  const [expandedFact, setExpandedFact] = useState<EditorFactId | null>("address");
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [acknowledgeRights, setAcknowledgeRights] = useState(false);
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importMessage, setImportMessage] = useState<{ tone: "default" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshListings = useCallback(async (refreshTone: "initial" | "refresh" = "refresh") => {
    if (refreshTone === "initial") {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/listings?limit=100`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw new Error(formatErrorMessage(payload, "Unable to load listings."));
      }

      setRows(parseListingsResponse(payload));
      setActionState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load listings.";
      setActionState({
        tone: "error",
        message,
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refreshListings("initial");
  }, [refreshListings]);

  const cards = useMemo(() => rows.map((row) => ({
    row,
    card: mapListingFactRowToCard(row),
  })), [rows]);

  const filteredCards = useMemo(
    () => filterListingsCards(cards.map((entry) => entry.card), statusFilter, verifiedOnly),
    [cards, statusFilter, verifiedOnly],
  );

  const visibleCards = useMemo(
    () => filteredCards
      .map((card) => cards.find((entry) => entry.card.id === card.id))
      .filter((entry): entry is { row: ListingFactRow; card: ReturnType<typeof mapListingFactRowToCard> } => entry !== undefined),
    [cards, filteredCards],
  );

  const summary = useMemo(() => ({
    active: cards.filter((entry) => entry.card.marketStatus === "active").length,
    pending: cards.filter((entry) => entry.card.marketStatus === "pending").length,
    sold: cards.filter((entry) => entry.card.marketStatus === "sold").length,
    recheck: cards.filter((entry) => entry.card.verificationStatus === "needs_recheck").length,
  }), [cards]);

  const pageCount = Math.max(1, Math.ceil(visibleCards.length / listingsPageSize));
  const safeCurrentPage = clampPage(currentPage, pageCount);
  const pagedCards = useMemo(
    () => visibleCards.slice((safeCurrentPage - 1) * listingsPageSize, safeCurrentPage * listingsPageSize),
    [safeCurrentPage, visibleCards],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, verifiedOnly, viewMode, rows.length]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const publicListingsHref = `/${workspaceSlug}/listings`;
  const editorPriceValue = parseNumberField(editor.price) ?? null;
  const currentEditorMarketStatus = editorMarketStatus(editor.status);

  const toggleFact = useCallback((fact: EditorFactId) => {
    setExpandedFact((current) => current === fact ? null : fact);
  }, []);

  const updateEditorField = useCallback((field: keyof EditorFormState, value: string | boolean) => {
    setEditor((current) => ({ ...current, [field]: value }));
  }, []);

  const updateEditorNumberField = useCallback((field: "price" | "beds" | "baths" | "squareFeet", value: number) => {
    setEditor((current) => ({ ...current, [field]: String(Math.max(0, value)) }));
  }, []);

  const openCreateSheet = useCallback(() => {
    setEditorMode("create");
    setEditorListingId(null);
    setEditor(emptyEditor());
    setImportUrl("");
    setAcknowledgeRights(false);
    setImportMessage(null);
    setExpandedFact("address");
    setEditorOpen(true);
  }, []);

  const openEditSheet = useCallback((row: ListingFactRow) => {
    setEditorMode("edit");
    setEditorListingId(row.id);
    setEditor(editorFromRow(row));
    setImportUrl("");
    setAcknowledgeRights(false);
    setImportMessage(null);
    setExpandedFact("address");
    setEditorOpen(true);
  }, []);

  const applyImportDraftToEditor = useCallback((draft: ManualListingFactRequest) => {
    setEditor((current) => ({
      ...current,
      address: draft.address ?? current.address,
      status: current.status,
      price: draft.price === null || draft.price === undefined ? current.price : String(draft.price),
      beds: draft.beds === null || draft.beds === undefined ? current.beds : String(draft.beds),
      baths: draft.baths === null || draft.baths === undefined ? current.baths : String(draft.baths),
      squareFeet: draft.squareFeet === null || draft.squareFeet === undefined ? current.squareFeet : String(draft.squareFeet),
      neighborhood: draft.neighborhood ?? current.neighborhood,
      propertyType: draft.propertyType ?? current.propertyType,
      photoUrl: draft.photoUrl ?? current.photoUrl,
      videoUrl: draft.videoUrl ?? current.videoUrl,
      mediaUrls: draft.mediaUrls !== undefined && draft.mediaUrls.length > 0
        ? Array.from(new Set([
          ...current.mediaUrls.split(/\n|,/).map((value) => value.trim()).filter((value) => value.length > 0),
          ...draft.mediaUrls,
        ])).join("\n")
        : current.mediaUrls,
      notes: draft.notes ?? current.notes,
      incentives: draft.incentives !== undefined && draft.incentives.length > 0
        ? draft.incentives.join(", ")
        : current.incentives,
      hasPool: draft.hasPool ?? current.hasPool,
    }));
  }, []);

  async function handleImportFromUrl() {
    const trimmedUrl = importUrl.trim();
    if (trimmedUrl.length === 0) {
      setImportMessage({ tone: "error", message: "Paste a listing URL to import." });
      return;
    }
    if (!acknowledgeRights) {
      setImportMessage({
        tone: "error",
        message: "Confirm you're the listing agent or have rights to republish this content before importing.",
      });
      return;
    }

    setIsImportingUrl(true);
    setImportMessage(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/listings/import-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl, acknowledgeRights: true }),
        credentials: "same-origin",
      });
      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw new Error(formatErrorMessage(payload, "Could not import that URL."));
      }

      const draftPayload = (payload as { draft?: ListingUrlImportDraft } | null)?.draft;
      if (draftPayload === undefined || draftPayload === null) {
        throw new Error("The import returned no draft.");
      }
      applyImportDraftToEditor(draftPayload.draft);
      const sourceLabel = draftPayload.source === "json_ld"
        ? "structured listing data"
        : draftPayload.source === "open_graph"
          ? "social preview metadata"
          : "page text";
      setImportMessage({
        tone: "default",
        message: `Pulled ${sourceLabel} from ${new URL(draftPayload.sourceUrl).hostname}. Review the fields below before saving.`,
      });
    } catch (error) {
      setImportMessage({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not import that URL.",
      });
    } finally {
      setIsImportingUrl(false);
    }
  }

  const runListingAction = useCallback(async (listingId: string, request: RequestInfo, init: RequestInit, successMessage: string) => {
    setActiveListingId(listingId);

    try {
      const response = await fetch(request, {
        ...init,
        credentials: "same-origin",
      });
      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw new Error(formatErrorMessage(payload, "Listing action failed."));
      }

      setActionState({
        tone: "default",
        message: successMessage,
      });
      await refreshListings();
    } catch (error) {
      setActionState({
        tone: "error",
        message: error instanceof Error ? error.message : "Listing action failed.",
      });
    } finally {
      setActiveListingId(null);
    }
  }, [refreshListings]);

  async function handleSaveEditor() {
    const request = buildListingRequest(editor);
    if (request.address.length === 0) {
      setActionState({
        tone: "error",
        message: "Address is required before saving a listing.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        editorMode === "create"
          ? `/api/workspaces/${workspaceId}/listings`
          : `/api/workspaces/${workspaceId}/listings/${editorListingId}`,
        {
          method: editorMode === "create" ? "POST" : "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
          credentials: "same-origin",
        },
      );
      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw new Error(formatErrorMessage(payload, "Unable to save listing."));
      }

      setEditorOpen(false);
      setActionState({
        tone: "default",
        message: editorMode === "create"
          ? "Listing added to the Harwick inventory."
          : "Listing details updated.",
      });
      await refreshListings();
    } catch (error) {
      setActionState({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save listing.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCsvImport(file: File) {
    setIsImporting(true);

    try {
      const csv = await file.text();
      const response = await fetch(`/api/workspaces/${workspaceId}/listings/import-csv`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ csv }),
        credentials: "same-origin",
      });
      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw new Error(formatErrorMessage(payload, "Unable to import listing CSV."));
      }

      const imported = typeof (payload as Record<string, unknown> | null)?.["imported"] === "number"
        ? ((payload as Record<string, unknown>)["imported"] as number)
        : 0;
      const skipped = typeof (payload as Record<string, unknown> | null)?.["skipped"] === "number"
        ? ((payload as Record<string, unknown>)["skipped"] as number)
        : 0;

      setActionState({
        tone: "default",
        message: `Imported ${imported} listing${imported === 1 ? "" : "s"}${skipped > 0 ? `, skipped ${skipped}` : ""}.`,
      });
      await refreshListings();
    } catch (error) {
      setActionState({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to import listing CSV.",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleMediaUpload(files: FileList | File[]) {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) {
      return;
    }

    setIsUploadingMedia(true);

    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("files", file);
      }

      const response = await fetch(`/api/workspaces/${workspaceId}/listings/media`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw new Error(formatErrorMessage(payload, "Unable to upload listing media."));
      }

      const media = parseUploadedListingMedia(payload);
      const image = media.find((entry) => entry.kind === "image");
      const video = media.find((entry) => entry.kind === "video");
      setEditor((current) => {
        const currentMediaUrls = current.mediaUrls
          .split(/\n|,/)
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
        const nextMediaUrls = Array.from(new Set([
          ...currentMediaUrls,
          ...media.map((entry) => entry.url),
        ]));

        return {
          ...current,
          photoUrl: current.photoUrl.trim().length > 0 ? current.photoUrl : image?.url ?? current.photoUrl,
          videoUrl: current.videoUrl.trim().length > 0 ? current.videoUrl : video?.url ?? current.videoUrl,
          mediaUrls: nextMediaUrls.join("\n"),
        };
      });
      setActionState({
        tone: "default",
        message: `Uploaded ${media.length} media file${media.length === 1 ? "" : "s"}. Save the listing to attach them.`,
      });
    } catch (error) {
      setActionState({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to upload listing media.",
      });
    } finally {
      setIsUploadingMedia(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--panel-1)] text-white">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-4 px-5 py-7 md:gap-5 md:px-8 md:py-9">
          <header className="space-y-3 border-b border-white/[0.06] pb-4 md:pb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--graphite-text-faint)]">
                  {workspaceName}
                </div>
                <h1 className="mt-2 font-display text-[28px] font-medium leading-none tracking-[-0.015em] text-white">
                  Listings
                </h1>
                <p className="mt-2 max-w-[34rem] text-[13px] leading-5 text-white/56">
                  Inventory Harwick can answer from, share with leads, verify, and keep ready for routing.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateSheet}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-white px-3 text-[12px] font-semibold lowercase text-[color:var(--panel-0)] shadow-[var(--panel-inset-top)] transition hover:bg-white/92"
              >
                <PiPlusBold className="h-3.5 w-3.5" />
                add listing
              </button>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-white/56 [font-variant-numeric:tabular-nums]">
              <span className="text-white/82"><span className="font-semibold text-white">{visibleCards.length}</span> {visibleCards.length === 1 ? "listing" : "listings"}</span>
              {summary.active > 0 ? (
                <>
                  <span aria-hidden className="text-white/22">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--sage)]" />
                    <span className="text-white/72"><span className="font-semibold text-white/92">{summary.active}</span> active</span>
                  </span>
                </>
              ) : null}
              {summary.pending > 0 ? (
                <>
                  <span aria-hidden className="text-white/22">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--clay)]" />
                    <span className="text-white/72"><span className="font-semibold text-white/92">{summary.pending}</span> pending</span>
                  </span>
                </>
              ) : null}
              {summary.recheck > 0 ? (
                <>
                  <span aria-hidden className="text-white/22">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--oxblood)]" />
                    <span className="text-white/72"><span className="font-semibold text-white/92">{summary.recheck}</span> need recheck</span>
                  </span>
                </>
              ) : null}
            </div>
          </header>

          <div className="space-y-2">
            <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium lowercase transition",
                    statusFilter === option.value
                      ? "border-white/18 bg-white text-[color:var(--panel-0)]"
                      : "border-white/[0.08] bg-white/[0.025] text-white/64 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white",
                  )}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setVerifiedOnly((value) => !value)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium lowercase transition",
                  verifiedOnly
                    ? "border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)]"
                    : "border-white/[0.08] bg-white/[0.025] text-white/64 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white",
                )}
              >
                verified only
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-[9px] border border-white/[0.08] bg-white/[0.025] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium lowercase transition",
                    viewMode === "cards" ? "bg-white text-[color:var(--panel-0)]" : "text-white/58 hover:text-white",
                  )}
                >
                  <Grid2X2 className="h-3.5 w-3.5" />
                  cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium lowercase transition",
                    viewMode === "list" ? "bg-white text-[color:var(--panel-0)]" : "text-white/58 hover:text-white",
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                  list
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href={publicListingsHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="open public listings page"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.025] text-white/64 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white sm:w-auto sm:gap-1.5 sm:px-3 sm:text-[12px] sm:font-medium sm:lowercase"
                >
                  <PiArrowSquareOutBold className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">public page</span>
                </a>
                <button
                  type="button"
                  onClick={() => void refreshListings()}
                  aria-label="refresh listings"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.025] text-white/64 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white sm:w-auto sm:gap-1.5 sm:px-3 sm:text-[12px] sm:font-medium sm:lowercase"
                >
                  {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PiArrowsClockwiseBold className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="import listings CSV"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.025] text-white/64 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white sm:w-auto sm:gap-1.5 sm:px-3 sm:text-[12px] sm:font-medium sm:lowercase"
                >
                  {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PiUploadSimpleBold className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">import csv</span>
                </button>
              </div>
            </div>
          </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) {
            void handleCsvImport(file);
          }
        }}
      />

      {actionState !== null ? (
        <div
          className={cn(
            "rounded-[14px] border px-4 py-3 text-[13px]",
            actionState.tone === "error"
              ? "border-oxblood/20 bg-oxblood-soft text-oxblood"
              : "border-sage/20 bg-sage-soft text-sage",
          )}
        >
          {actionState.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[18px] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] shadow-[var(--panel-inset-top-soft)]">
          <div className="inline-flex items-center gap-3 text-[13px] lowercase text-[color:var(--graphite-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            loading live inventory...
          </div>
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
            {starterListingCards.map((card) => (
              <StarterGlassListingCard
                key={card.title}
                gradient={card.gradient}
                label={card.label}
                meta={card.meta}
                title={card.title}
                onAddListing={openCreateSheet}
              />
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-[18px] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] px-5 py-4 text-[color:var(--graphite-text)] shadow-[var(--panel-inset-top-soft)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-display text-[22px] font-medium">no saved listings yet.</div>
              <p className="mt-1 text-[13px] text-[color:var(--graphite-text-muted)]">
                Add a listing or import a CSV and the saved inventory will render with these glass cards.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openCreateSheet}
                className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-white px-4 text-[12px] font-semibold lowercase text-[color:var(--panel-0)] shadow-[var(--panel-inset-top)]"
              >
                <PiPlusBold className="h-4 w-4" />
                add listing
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-4 text-[12px] font-medium lowercase text-[color:var(--graphite-text-muted)]"
              >
                <PiUploadSimpleBold className="h-4 w-4" />
                import csv
              </button>
            </div>
          </div>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[var(--panel-radius-md)] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] shadow-[var(--panel-inset-top-soft)]">
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--panel-line-soft)] px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--graphite-text-faint)]">listing</div>
                <div className="mt-1 text-[12px] text-[color:var(--graphite-text-muted)]">share-ready inventory</div>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--graphite-text-faint)]">status</div>
            </div>
            {pagedCards.map(({ row, card }) => {
              const isBusy = activeListingId === row.id;
              return (
                <article
                  key={row.id}
                  className="border-b border-[color:var(--panel-line-soft)] px-4 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 gap-3">
                    <button
                      type="button"
                      onClick={() => openEditSheet(row)}
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-faint)] shadow-[var(--panel-inset-top-soft)]"
                      aria-label={`edit ${card.address}`}
                    >
                      {card.photoUrl !== null ? (
                        <img src={card.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                      <div className="absolute left-2 top-2">
                        <StatusDot
                          status={card.marketStatus}
                          label=""
                          className="rounded-full border border-white/14 bg-black/45 px-1.5 py-1 backdrop-blur-md"
                        />
                      </div>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => openEditSheet(row)}
                            className="block max-w-full truncate text-left text-[14px] font-semibold leading-5 text-[color:var(--graphite-text)]"
                          >
                            {card.address}
                          </button>
                          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[color:var(--graphite-text-muted)]">
                            <PiMapPinFill className="h-3.5 w-3.5 shrink-0 text-[color:var(--graphite-text-faint)]" />
                            <span className="truncate">{card.neighborhoodLabel} · {card.propertyTypeLabel}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-display text-[18px] font-medium leading-none text-[color:var(--graphite-text)]">{card.priceLabel}</div>
                          <div className="mt-1 text-[10px] lowercase text-[color:var(--graphite-text-faint)]">{card.updatedLabel}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-[12px] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-2)]/60 px-3 py-2 text-[11px] lowercase text-[color:var(--graphite-text-muted)] shadow-[var(--panel-inset-top-soft)]">
                        <div className="flex items-center gap-1.5">
                          <FACT_ICONS.beds className="h-3.5 w-3.5 text-[var(--sage)]" />
                          <span className="truncate">{card.bedsLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FACT_ICONS.baths className="h-3.5 w-3.5 text-[var(--sage)]" />
                          <span className="truncate">{card.bathsLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FACT_ICONS.sqft className="h-3.5 w-3.5 text-[var(--sage)]" />
                          <span className="truncate">{card.squareFeetLabel}</span>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusDot status={card.marketStatus} label={card.marketStatusLabel.toLowerCase()} />
                        <VerificationDot status={card.verificationStatus} label={card.verificationLabel.toLowerCase()} />
                        <span className="text-[11px] lowercase text-[color:var(--graphite-text-faint)]">{card.verificationDateLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 pl-[92px]">
                    <a
                      href={`/api/workspaces/${workspaceId}/listings/${row.id}/share-card?format=story`}
                      download={`${row.id}-story.png`}
                      target="_blank"
                      rel="noreferrer"
                      title="download IG story image"
                      className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--sage,#88a276)] px-3 text-[12px] font-semibold lowercase text-[#07100a] shadow-[0_8px_18px_rgba(136,162,118,0.28)] transition hover:opacity-92"
                    >
                      <PiShareNetworkBold className="h-3.5 w-3.5" />
                      story
                    </a>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditSheet(row)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-3 text-[12px] font-medium lowercase text-[color:var(--graphite-text-muted)] shadow-[var(--panel-inset-top-soft)] hover:text-[color:var(--graphite-text)]"
                      >
                        <PiPencilSimpleBold className="h-3.5 w-3.5" />
                        edit
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label="more listing actions"
                          disabled={isBusy}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)] shadow-[var(--panel-inset-top-soft)] transition hover:text-[color:var(--graphite-text)] disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PiDotsThreeBold className="h-4 w-4" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={6} className="w-56">
                          <DropdownMenuItem
                            onSelect={() => void runListingAction(
                              row.id,
                              `/api/workspaces/${workspaceId}/listings/${row.id}/verify`,
                              { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
                              "Listing verified.",
                            )}
                          >
                            <PiCheckCircleFill className="h-4 w-4" />
                            mark verified
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a
                              href={card.publicUrl ?? publicListingsHref}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2"
                            >
                              <PiArrowSquareOutBold className="h-4 w-4" />
                              open public page
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => void runListingAction(
                              row.id,
                              `/api/workspaces/${workspaceId}/listings/${row.id}`,
                              { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Pending" }) },
                              "Listing moved to pending.",
                            )}
                          >
                            <PiClockFill className="h-4 w-4" />
                            mark pending
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void runListingAction(
                              row.id,
                              `/api/workspaces/${workspaceId}/listings/${row.id}`,
                              { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Sold" }) },
                              "Listing marked sold.",
                            )}
                          >
                            <PiHouseFill className="h-4 w-4" />
                            mark sold
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <PaginationFooter
            currentPage={safeCurrentPage}
            itemCount={visibleCards.length}
            pageCount={pageCount}
            pageSize={listingsPageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2 min-[1800px]:grid-cols-3">
          {pagedCards.map(({ row, card }) => {
            const isBusy = activeListingId === row.id;
            return (
              <article
                key={row.id}
                className="group relative min-h-[560px] overflow-hidden rounded-[30px] bg-harwick-ink text-left shadow-[0_34px_92px_rgba(18,26,20,0.18)] ring-1 ring-black/[0.05] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_38px_88px_rgba(18,26,20,0.22)]"
              >
                {card.photoUrl !== null ? (
                  <img
                    src={card.photoUrl}
                    alt={card.address}
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(9,49,31,0.95),rgba(16,24,20,0.96),rgba(62,115,92,0.75))]" />
                )}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(180deg,rgba(7,15,10,0.04)_0%,rgba(7,15,10,0.18)_34%,rgba(7,15,10,0.9)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 h-[60%] backdrop-blur-[1px] [mask-image:linear-gradient(180deg,transparent_0%,black_58%)]" />

                <div className="absolute left-5 right-5 top-5 flex items-start justify-between gap-3">
                  <StatusDot
                    status={card.marketStatus}
                    label={card.marketStatusLabel.toLowerCase()}
                    className="rounded-full border border-white/14 bg-black/40 px-3 py-1.5 text-white/88 backdrop-blur-md shadow-[0_14px_32px_rgba(14,18,15,0.14)]"
                  />
                  <a
                    href={card.publicUrl ?? publicListingsHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`open public page for ${card.address}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/14 bg-black/40 text-white/86 backdrop-blur-md shadow-[0_14px_32px_rgba(14,18,15,0.14)] transition hover:bg-black/55"
                  >
                    <PiArrowSquareOutBold className="h-3.5 w-3.5" />
                  </a>
                </div>

                {card.photoUrl === null ? (
                  <div className="absolute inset-0 flex items-center justify-center text-white/42">
                    <div className="flex flex-col items-center gap-2">
                      <ImageIcon className="h-10 w-10" />
                      <span className="text-sm">upload cover media</span>
                    </div>
                  </div>
                ) : null}

                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(circle_at_30%_70%,rgba(86,112,45,0.34),transparent_42%),linear-gradient(180deg,transparent_0%,rgba(8,17,10,0.88)_100%)]" />
                  <div className="relative rounded-[24px] border border-white/12 bg-[#07100a]/62 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_-24px_70px_rgba(6,12,8,0.15)] backdrop-blur-[12px]">
                    <div className="mb-2 flex items-end gap-2">
                      <div className="text-[30px] font-semibold leading-none tracking-[-0.01em]">{card.priceLabel}</div>
                      <div className="pb-0.5 text-[12px] text-white/54">list price</div>
                    </div>
                    <div className="max-w-[86%] truncate text-[16px] font-medium text-white/88">{card.address}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[13px] text-white/58">
                      <PiMapPinFill aria-hidden="true" className="h-3.5 w-3.5" />
                      <span className="truncate">{card.neighborhoodLabel}</span>
                    </div>
                    <div className="my-4 h-px bg-white/16" />
                    <div className="grid grid-cols-3 gap-3 text-[12px]">
                      <div>
                        <div className="text-white/42">beds</div>
                        <div className="mt-1 font-semibold text-white/88">{card.bedsLabel}</div>
                      </div>
                      <div>
                        <div className="text-white/42">baths</div>
                        <div className="mt-1 font-semibold text-white/88">{card.bathsLabel}</div>
                      </div>
                      <div>
                        <div className="text-white/42">area</div>
                        <div className="mt-1 font-semibold text-white/88">{card.squareFeetLabel}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/62">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{card.propertyTypeLabel}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{card.mlsLabel}</span>
                      {card.hasPool ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">pool</span>
                      ) : null}
                    </div>
                    {card.notes !== null ? (
                      <div className="mt-4 line-clamp-2 rounded-2xl border border-white/10 bg-black/24 px-3 py-2 text-[12px] leading-5 text-white/70">
                        {card.notes}
                      </div>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/16 pt-4 text-[12px] text-white/56">
                      <span className="truncate">{card.sourceLabel} · {card.updatedLabel}</span>
                      <span className="shrink-0">{card.verificationDateLabel}</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <VerificationDot
                        status={card.verificationStatus}
                        label={card.verificationLabel.toLowerCase()}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => openEditSheet(row)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 text-[12px] font-medium lowercase text-white/82 transition hover:border-white/22 hover:bg-white/[0.06]"
                      >
                        <PiPencilSimpleBold className="h-3.5 w-3.5" />
                        edit
                      </button>
                      <a
                        href={`/api/workspaces/${workspaceId}/listings/${row.id}/share-card?format=story`}
                        download={`${row.id}-story.png`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--sage,#88a276)] px-3.5 text-[12px] font-semibold lowercase text-[#07100a] shadow-[0_10px_22px_rgba(136,162,118,0.32)] transition hover:opacity-92"
                      >
                        <PiShareNetworkBold className="h-3.5 w-3.5" />
                        share story
                      </a>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label="more actions"
                          disabled={isBusy}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/72 transition hover:border-white/22 hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiDotsThreeBold className="h-4 w-4" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={6} className="w-56">
                          <DropdownMenuItem asChild>
                            <a
                              href={card.publicUrl ?? publicListingsHref}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2"
                            >
                              <PiArrowSquareOutBold className="h-4 w-4" />
                              open public page
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a
                              href={`/api/workspaces/${workspaceId}/listings/${row.id}/share-card?format=feed`}
                              download={`${row.id}-feed.png`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2"
                            >
                              <PiShareNetworkBold className="h-4 w-4" />
                              download feed image
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => void runListingAction(
                              row.id,
                              `/api/workspaces/${workspaceId}/listings/${row.id}/verify`,
                              { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
                              "Listing verified.",
                            )}
                          >
                            <PiCheckCircleFill className="h-4 w-4" />
                            mark verified
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              const nextRecheckAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
                              void runListingAction(
                                row.id,
                                `/api/workspaces/${workspaceId}/listings/${row.id}`,
                                {
                                  method: "PATCH",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ verificationStatus: "needs_recheck", needsRecheckAt: nextRecheckAt }),
                                },
                                "Listing marked for recheck.",
                              );
                            }}
                          >
                            <PiArrowsClockwiseBold className="h-4 w-4" />
                            mark for recheck
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => void runListingAction(
                              row.id,
                              `/api/workspaces/${workspaceId}/listings/${row.id}`,
                              { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Pending" }) },
                              "Listing moved to pending.",
                            )}
                          >
                            <PiClockFill className="h-4 w-4" />
                            mark pending
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void runListingAction(
                              row.id,
                              `/api/workspaces/${workspaceId}/listings/${row.id}`,
                              { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Sold" }) },
                              "Listing marked sold.",
                            )}
                          >
                            <PiHouseFill className="h-4 w-4" />
                            mark sold
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          <div className="xl:col-span-2 min-[1800px]:col-span-3">
            <PaginationFooter
              currentPage={safeCurrentPage}
              itemCount={visibleCards.length}
              pageCount={pageCount}
              pageSize={listingsPageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      <Drawer.Root noBodyStyles open={editorOpen} onOpenChange={setEditorOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-[rgba(8,12,8,0.62)] backdrop-blur-[18px] backdrop-saturate-125" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[94vh] max-w-[760px] flex-col overflow-hidden rounded-t-[32px] border border-b-0 border-white/8 bg-[#0c130e] text-white shadow-[0_-32px_80px_-12px_rgba(6,12,8,0.55)] outline-none"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-t-[32px]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 86% 4%, rgba(136,162,118,0.22), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 22%)",
              }}
            />
            <div className="relative mt-2.5 flex justify-center">
              <div className="h-[5px] w-[44px] rounded-full bg-white/22" />
            </div>
            <div className="relative flex items-start justify-between gap-3 px-6 pb-4 pt-3.5">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-white/46">
                  inventory
                </div>
                <Drawer.Title className="mt-2 font-display text-[26px] font-medium leading-[1.05] tracking-[-0.02em] text-white">
                  {editorMode === "create" ? "add a listing" : "edit listing"}
                </Drawer.Title>
              </div>
              <Drawer.Close className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-white/22 hover:text-white" aria-label="close">
                <X className="h-4 w-4" />
              </Drawer.Close>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-5 pb-6">
            {editorMode === "create" ? (
              <div className="space-y-2.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/46">
                  import from a url
                </div>
                <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-white/82">
                    <PiGlobeBold className="h-3.5 w-3.5" />
                    <div className="text-[13px] font-semibold lowercase">paste a har, zillow, redfin, or mls url</div>
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-white/52">
                    Harwick reads the page's structured data and pre-fills this form.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={importUrl}
                      onChange={(event) => setImportUrl(event.target.value)}
                      placeholder="https://www.har.com/homedetail/..."
                      className="flex-1 rounded-[12px] border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-white/28 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#88a276]/30"
                      disabled={isImportingUrl}
                    />
                    <button
                      type="button"
                      onClick={() => void handleImportFromUrl()}
                      disabled={isImportingUrl}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#88a276] px-4 py-2.5 text-[12px] font-semibold lowercase text-[#07100a] shadow-[0_10px_22px_rgba(136,162,118,0.30)] transition disabled:opacity-50"
                    >
                      {isImportingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiGlobeBold className="h-4 w-4" />}
                      import
                    </button>
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-[12px] leading-5 text-white/56">
                    <input
                      type="checkbox"
                      checked={acknowledgeRights}
                      onChange={(event) => setAcknowledgeRights(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-white/22 bg-white/[0.04] accent-[#88a276]"
                    />
                    <span>
                      I'm the listing agent or have rights to republish this content. Photos and MLS data carry copyright; Harwick won't import without this acknowledgment.
                    </span>
                  </label>
                  {importMessage !== null ? (
                    <div
                      className={cn(
                        "mt-3 rounded-[12px] border px-3 py-2 text-[12px]",
                        importMessage.tone === "error"
                          ? "border-[rgba(225,108,108,0.32)] bg-[rgba(225,108,108,0.10)] text-[rgba(244,180,180,0.92)]"
                          : "border-[rgba(136,162,118,0.32)] bg-[rgba(136,162,118,0.10)] text-[rgba(176,204,158,0.95)]",
                      )}
                    >
                      {importMessage.message}
                    </div>
                  ) : null}
                </div>
                <div className="h-px bg-white/8" />
              </div>
            ) : null}

            <LiveListingPreview
              workspaceName={workspaceName}
              address={editor.address}
              price={editorPriceValue === null ? "" : formatCompactPrice(editorPriceValue)}
              priceValue={editorPriceValue}
              neighborhood={editor.neighborhood}
              beds={editor.beds}
              baths={editor.baths}
              squareFeet={editor.squareFeet}
              propertyType={editor.propertyType}
              hasPool={editor.hasPool}
              notes={editor.notes}
              photoUrl={editor.photoUrl}
              marketStatus={currentEditorMarketStatus}
            />

            <div className="space-y-2.5">
              <SectionEyebrow>listing facts</SectionEyebrow>
              <FieldRowGroup>
                <FieldRow
                  icon={FACT_ICONS.location}
                  label="address"
                  value={editor.address}
                  hint="123 Main St, Houston, TX 77001"
                  onPress={() => toggleFact("address")}
                  caretRotated={expandedFact === "address"}
                >
                  {expandedFact === "address" ? (
                    <InlineTextEditor
                      value={editor.address}
                      onChange={(value) => updateEditorField("address", value)}
                      placeholder="123 Main St, Houston, TX 77001"
                      onCommit={() => setExpandedFact(null)}
                    />
                  ) : undefined}
                </FieldRow>
                <FieldRowDivider />
                <FieldRow
                  icon={FACT_ICONS.status}
                  label="market status"
                  value={editor.status}
                  hint="active"
                  onPress={() => toggleFact("status")}
                  caretRotated={expandedFact === "status"}
                >
                  {expandedFact === "status" ? (
                    <div className="grid grid-cols-3 gap-2">
                      {(["Active", "Pending", "Sold"] as const).map((status) => {
                        const active = editor.status.trim().toLowerCase() === status.toLowerCase();
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateEditorField("status", status)}
                            className={cn(
                              "inline-flex h-10 items-center justify-center rounded-full border px-3 text-[12px] font-semibold lowercase transition",
                              active
                                ? "border-[#88a276]/40 bg-[#88a276] text-[#07100a]"
                                : "border-white/12 bg-white/[0.04] text-white/74 hover:border-white/22 hover:bg-white/[0.07]",
                            )}
                          >
                            {status}
                          </button>
                        );
                      })}
                    </div>
                  ) : undefined}
                </FieldRow>
                <FieldRowDivider />
                <FieldRow
                  icon={FACT_ICONS.hoa}
                  label="list price"
                  value={editorPriceValue === null ? null : formatCompactPrice(editorPriceValue)}
                  hint="set price"
                  onPress={() => toggleFact("price")}
                  caretRotated={expandedFact === "price"}
                >
                  {expandedFact === "price" ? (
                    <NumberStepper
                      value={editorPriceValue}
                      defaultValue={450000}
                      min={0}
                      max={20_000_000}
                      step={(current) => current < 500000 ? 10000 : 25000}
                      formatValue={formatCompactPrice}
                      onChange={(value) => updateEditorNumberField("price", value)}
                    />
                  ) : undefined}
                </FieldRow>
                <FieldRowDivider />
                <FieldRow
                  icon={FACT_ICONS.beds}
                  label="beds"
                  value={editor.beds.length > 0 ? `${editor.beds} beds` : null}
                  hint="add bedrooms"
                  onPress={() => toggleFact("beds")}
                  caretRotated={expandedFact === "beds"}
                >
                  {expandedFact === "beds" ? (
                    <NumberStepper
                      value={parseNumberField(editor.beds) ?? null}
                      min={0}
                      max={20}
                      formatValue={(value) => `${formatNumberLabel(value)} beds`}
                      onChange={(value) => updateEditorNumberField("beds", value)}
                    />
                  ) : undefined}
                </FieldRow>
                <FieldRowDivider />
                <FieldRow
                  icon={FACT_ICONS.baths}
                  label="baths"
                  value={editor.baths.length > 0 ? `${editor.baths} baths` : null}
                  hint="add baths"
                  onPress={() => toggleFact("baths")}
                  caretRotated={expandedFact === "baths"}
                >
                  {expandedFact === "baths" ? (
                    <NumberStepper
                      value={parseNumberField(editor.baths) ?? null}
                      min={0}
                      max={20}
                      step={0.5}
                      formatValue={(value) => `${formatNumberLabel(value)} baths`}
                      onChange={(value) => updateEditorNumberField("baths", value)}
                    />
                  ) : undefined}
                </FieldRow>
                <FieldRowDivider />
                <FieldRow
                  icon={FACT_ICONS.sqft}
                  label="square feet"
                  value={editor.squareFeet.length > 0 ? `${formatNumberLabel(parseNumberField(editor.squareFeet) ?? 0)} sqft` : null}
                  hint="add area"
                  onPress={() => toggleFact("squareFeet")}
                  caretRotated={expandedFact === "squareFeet"}
                >
                  {expandedFact === "squareFeet" ? (
                    <NumberStepper
                      value={parseNumberField(editor.squareFeet) ?? null}
                      defaultValue={2000}
                      min={0}
                      max={25000}
                      step={50}
                      formatValue={(value) => `${formatNumberLabel(value)} sqft`}
                      onChange={(value) => updateEditorNumberField("squareFeet", value)}
                    />
                  ) : undefined}
                </FieldRow>
              </FieldRowGroup>
            </div>

            <div className="space-y-2.5">
              <SectionEyebrow>market context</SectionEyebrow>
              <FieldRowGroup>
                <FieldRow
                  icon={FACT_ICONS.location}
                  label="neighborhood"
                  value={editor.neighborhood}
                  hint="River Oaks"
                  onPress={() => toggleFact("neighborhood")}
                  caretRotated={expandedFact === "neighborhood"}
                >
                  {expandedFact === "neighborhood" ? (
                    <InlineTextEditor
                      value={editor.neighborhood}
                      onChange={(value) => updateEditorField("neighborhood", value)}
                      placeholder="River Oaks"
                      onCommit={() => setExpandedFact(null)}
                    />
                  ) : undefined}
                </FieldRow>
                <FieldRowDivider />
                <FieldRow
                  icon={FACT_ICONS.propertyType}
                  label="property type"
                  value={editor.propertyType}
                  hint="single family"
                  onPress={() => toggleFact("propertyType")}
                  caretRotated={expandedFact === "propertyType"}
                >
                  {expandedFact === "propertyType" ? (
                    <InlineTextEditor
                      value={editor.propertyType}
                      onChange={(value) => updateEditorField("propertyType", value)}
                      placeholder="Single family"
                      onCommit={() => setExpandedFact(null)}
                    />
                  ) : undefined}
                </FieldRow>
                <FieldRowDivider />
                <FieldRow
                  icon={FACT_ICONS.pool}
                  label="pool"
                  value={editor.hasPool ? "pool on site" : "no pool marked"}
                  hint="optional"
                >
                  <button
                    type="button"
                    onClick={() => updateEditorField("hasPool", !editor.hasPool)}
                    className={cn(
                      "inline-flex h-10 items-center justify-center rounded-full border px-4 text-[12px] font-semibold lowercase transition",
                      editor.hasPool
                        ? "border-[#88a276]/40 bg-[#88a276] text-[#07100a]"
                        : "border-white/12 bg-white/[0.04] text-white/74 hover:border-white/22 hover:bg-white/[0.07]",
                    )}
                  >
                    {editor.hasPool ? "pool included" : "mark pool"}
                  </button>
                </FieldRow>
                <FieldRowDivider />
                <FieldRow
                  icon={FACT_ICONS.hoa}
                  label="incentives"
                  value={editor.incentives}
                  hint="4.99%, closing costs"
                  onPress={() => toggleFact("incentives")}
                  caretRotated={expandedFact === "incentives"}
                >
                  {expandedFact === "incentives" ? (
                    <ChipInputEditor
                      values={editor.incentives.split(",").map((value) => value.trim()).filter((value) => value.length > 0)}
                      onChange={(values) => updateEditorField("incentives", values.join(", "))}
                      placeholder="closing costs"
                    />
                  ) : undefined}
                </FieldRow>
              </FieldRowGroup>
            </div>

            <div className="space-y-2.5">
              <SectionEyebrow>operator notes</SectionEyebrow>
              <textarea
                value={editor.notes}
                onChange={(event) => updateEditorField("notes", event.target.value)}
                className="min-h-28 w-full rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3 text-[14px] leading-6 text-white outline-none placeholder:text-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-white/24 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#88a276]/25"
                placeholder="Builder incentives, access instructions, visual notes..."
              />
            </div>

            <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[13px] font-semibold lowercase text-white/90">media</div>
                  <div className="mt-1 text-[12px] text-white/52">photos and videos for the internal card and public listing.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium lowercase text-white/82 transition hover:border-white/24 hover:bg-white/[0.06]">
                    {isUploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiUploadSimpleBold className="h-4 w-4" />}
                    photos
                    <input
                      className="hidden"
                      multiple
                      type="file"
                      accept="image/*"
                      disabled={isUploadingMedia}
                      onChange={(event) => {
                        const files = event.target.files;
                        if (files !== null) {
                          void handleMediaUpload(files);
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium lowercase text-white/82 transition hover:border-white/24 hover:bg-white/[0.06]">
                    {isUploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiUploadSimpleBold className="h-4 w-4" />}
                    videos
                    <input
                      className="hidden"
                      multiple
                      type="file"
                      accept="video/*"
                      disabled={isUploadingMedia}
                      onChange={(event) => {
                        const files = event.target.files;
                        if (files !== null) {
                          void handleMediaUpload(files);
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              {editor.mediaUrls.trim().length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {editor.mediaUrls.split(/\n|,/).filter((url) => url.trim().length > 0).slice(0, 4).map((url) => (
                    <div className="truncate rounded-[12px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/56" key={url}>
                      {url}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

          </div>
          </div>
            <div className="relative border-t border-white/8 bg-[#0c130e]/95 px-6 pb-[calc(max(env(safe-area-inset-bottom),18px)+42px)] pt-4 sm:pb-[max(env(safe-area-inset-bottom),18px)]">
              <div className="mb-3 flex items-center justify-between text-[11px] leading-none text-white/56">
                <span>
                  {editor.price.trim().length > 0 ? (
                    <>
                      <span className="font-display text-[17px] font-medium leading-none tracking-[-0.01em] text-white">
                        ${Number(editor.price.replace(/[^0-9]/g, "")).toLocaleString()}
                      </span>
                      <span className="ml-1.5">list price</span>
                    </>
                  ) : (
                    <span>price not set</span>
                  )}
                </span>
                <Drawer.Close className="text-[11px] font-medium text-white/52 transition hover:text-white/80">
                  cancel
                </Drawer.Close>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveEditor()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#88a276] px-5 py-3.5 text-[14px] font-semibold lowercase text-[#07100a] shadow-[0_14px_32px_rgba(136,162,118,0.36)] transition active:opacity-86 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editorMode === "create" ? "create listing" : "save changes"}
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
        </div>
      </div>
    </div>
  );
}
