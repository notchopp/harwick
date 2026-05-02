"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Grid2X2,
  Home,
  ImageIcon,
  List,
  Loader2,
  MapPinned,
  PencilLine,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import type { ListingFactRow } from "../../lib/supabase/listings";
import { cn } from "../../lib/utils";
import {
  filterListingsCards,
  mapListingFactRowToCard,
  type ListingsStatusFilter,
} from "./listings-data";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";

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

const marketStatusTone = {
  active: "border-sage/20 bg-sage-soft text-sage",
  pending: "border-clay/20 bg-clay-soft text-clay",
  sold: "border-stone/15 bg-stone-soft text-muted",
} as const;

const verificationTone = {
  verified: "border-sage/20 bg-sage-soft text-sage",
  needs_recheck: "border-oxblood/20 bg-oxblood-soft text-oxblood",
  unverified: "border-border bg-surface-muted text-muted",
} as const;

const listingsPageSize = 6;

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
      <div className="absolute left-5 top-5 rounded-full bg-white/88 px-3 py-1.5 text-[11px] font-semibold text-harwick-ink shadow-[0_14px_32px_rgba(14,18,15,0.14)] backdrop-blur-md">
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
    <div className="flex flex-col gap-3 rounded-[16px] border border-border bg-surface px-4 py-3 text-[12px] text-muted shadow-[var(--shadow-tight)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        showing {start}-{end} of {props.itemCount}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={props.currentPage <= 1}
          onClick={() => props.onPageChange(props.currentPage - 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[12px] font-medium text-muted transition hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          prev
        </button>
        <span className="min-w-20 text-center text-[11px] text-muted-subtle">
          page {props.currentPage} / {props.pageCount}
        </span>
        <button
          type="button"
          disabled={props.currentPage >= props.pageCount}
          onClick={() => props.onPageChange(props.currentPage + 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[12px] font-medium text-muted transition hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
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
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
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

  const openCreateSheet = useCallback(() => {
    setEditorMode("create");
    setEditorListingId(null);
    setEditor(emptyEditor());
    setEditorOpen(true);
  }, []);

  const openEditSheet = useCallback((row: ListingFactRow) => {
    setEditorMode("edit");
    setEditorListingId(row.id);
    setEditor(editorFromRow(row));
    setEditorOpen(true);
  }, []);

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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceTopbar context={`listings · inventory · ${visibleCards.length} shown`} workspaceName={workspaceName}>
        <div className="ml-auto flex items-center gap-[10px]">
          <div className="flex items-center gap-[5px] rounded-full border border-border bg-surface-muted px-[9px] py-1 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-qualified" />
            Repliers Ready
          </div>
          <div className="flex items-center gap-[5px] rounded-full border border-border bg-surface-muted px-[9px] py-1 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-qualified" />
            Public Page Live
          </div>
          <div className="flex items-center gap-[5px] rounded-full border border-border bg-surface-muted px-[9px] py-1 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-warm" />
            {summary.recheck} Recheck
          </div>
        </div>
      </WorkspaceTopbar>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="space-y-5 text-harwick-ink">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[34px] font-medium leading-none">listings</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted">
            Inventory Harwick can answer from, send to leads, verify against source data, and keep ready for routing.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-[14px] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-tight)]">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-subtle">active</div>
            <div className="mt-2 font-display text-[24px] font-medium leading-none">{summary.active}</div>
          </div>
          <div className="rounded-[14px] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-tight)]">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-subtle">pending</div>
            <div className="mt-2 font-display text-[24px] font-medium leading-none">{summary.pending}</div>
          </div>
          <div className="rounded-[14px] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-tight)]">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-subtle">sold</div>
            <div className="mt-2 font-display text-[24px] font-medium leading-none">{summary.sold}</div>
          </div>
          <div className="rounded-[14px] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-tight)]">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-subtle">recheck</div>
            <div className="mt-2 font-display text-[24px] font-medium leading-none">{summary.recheck}</div>
          </div>
        </div>
      </div>

      <div className="harwick-card flex flex-col gap-4 p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={cn(
                "harwick-pill px-3.5 py-2 text-[12px] font-medium transition-all hover:-translate-y-px",
                statusFilter === option.value
                  ? "harwick-pill-active"
                  : "text-muted hover:border-border-strong hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setVerifiedOnly((value) => !value)}
            className={cn(
              "harwick-pill px-3.5 py-2 text-[12px] font-medium transition-all hover:-translate-y-px",
              verifiedOnly
                ? "harwick-pill-active"
                : "text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            verified only
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="harwick-pill inline-flex p-1">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition",
                viewMode === "cards" ? "harwick-pill-active" : "text-muted hover:text-foreground",
              )}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
              cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition",
                viewMode === "list" ? "harwick-pill-active" : "text-muted hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" />
              list
            </button>
          </div>
          <a
            href={publicListingsHref}
            target="_blank"
            rel="noreferrer"
            className="harwick-pill inline-flex items-center gap-2 px-3.5 py-2 text-[12px] font-medium text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            open public page
          </a>
          <button
            type="button"
            onClick={() => void refreshListings()}
            className="harwick-pill inline-flex items-center gap-2 px-3.5 py-2 text-[12px] font-medium text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            refresh
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="harwick-pill inline-flex items-center gap-2 px-3.5 py-2 text-[12px] font-medium text-muted transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground"
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            import csv
          </button>
          <button
            type="button"
            onClick={openCreateSheet}
            className="inline-flex items-center gap-2 rounded-full border border-harwick-ink bg-[linear-gradient(180deg,#233729_0%,#132218_100%)] px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_10px_22px_rgba(19,34,24,0.18)] transition-all hover:-translate-y-px"
          >
            <Plus className="h-4 w-4" />
            add listing
          </button>
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
        <div className="flex min-h-[260px] items-center justify-center rounded-[18px] border border-border bg-surface">
          <div className="inline-flex items-center gap-3 text-[13px] text-muted">
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
          <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface px-5 py-4 shadow-[var(--shadow-tight)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-display text-[22px] font-medium">no saved listings yet.</div>
              <p className="mt-1 text-[13px] text-muted">
                Add a listing or import a CSV and the saved inventory will render with these glass cards.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openCreateSheet}
                className="inline-flex items-center gap-2 rounded-full bg-harwick-ink px-4 py-2 text-[12px] font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                add listing
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-medium text-muted"
              >
                <Upload className="h-4 w-4" />
                import csv
              </button>
            </div>
          </div>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[18px] border border-border bg-surface shadow-[var(--shadow-tight)]">
            <div className="grid grid-cols-[minmax(220px,1.6fr)_120px_110px_150px_120px_170px] gap-4 border-b border-border bg-surface-muted px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-subtle">
              <div>listing</div>
              <div>status</div>
              <div>price</div>
              <div>facts</div>
              <div>verification</div>
              <div className="text-right">actions</div>
            </div>
            {pagedCards.map(({ row, card }) => {
              const isBusy = activeListingId === row.id;
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(220px,1.6fr)_120px_110px_150px_120px_170px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-14 w-16 shrink-0 overflow-hidden rounded-[12px] bg-harwick-ink">
                      {card.photoUrl !== null ? (
                        <img src={card.photoUrl} alt={card.address} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/50">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-foreground">{card.address}</div>
                      <div className="mt-1 truncate text-[12px] text-muted">{card.neighborhoodLabel} · {card.propertyTypeLabel}</div>
                    </div>
                  </div>
                  <div>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", marketStatusTone[card.marketStatus])}>
                      {card.marketStatusLabel}
                    </span>
                  </div>
                  <div className="font-display text-[20px] font-medium">{card.priceLabel}</div>
                  <div className="text-[12px] text-muted">
                    {card.bedsLabel} · {card.bathsLabel}
                    <div className="mt-0.5 text-[11px] text-muted-subtle">{card.squareFeetLabel}</div>
                  </div>
                  <div>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", verificationTone[card.verificationStatus])}>
                      {card.verificationLabel}
                    </span>
                    <div className="mt-1 text-[10px] text-muted-subtle">{card.verificationDateLabel}</div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditSheet(row)}
                      className="rounded-full border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-foreground"
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void runListingAction(
                        row.id,
                        `/api/workspaces/${workspaceId}/listings/${row.id}/verify`,
                        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
                        "Listing verified.",
                      )}
                      className="rounded-full bg-harwick-ink px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      verify
                    </button>
                  </div>
                </div>
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
                  <div className="flex flex-wrap gap-2">
                    <div className={cn("rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-[0_14px_32px_rgba(14,18,15,0.14)] backdrop-blur-md", marketStatusTone[card.marketStatus])}>
                      {card.marketStatusLabel}
                    </div>
                    <div className={cn("rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-[0_14px_32px_rgba(14,18,15,0.14)] backdrop-blur-md", verificationTone[card.verificationStatus])}>
                      {card.verificationLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditSheet(row)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/88 text-harwick-ink shadow-[0_14px_32px_rgba(14,18,15,0.16)] backdrop-blur-md transition hover:bg-white"
                    aria-label={`edit ${card.address}`}
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
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
                      <MapPinned aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.7} />
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
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runListingAction(
                          row.id,
                          `/api/workspaces/${workspaceId}/listings/${row.id}`,
                          {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ status: "Pending" }),
                          },
                          "Listing moved to pending.",
                        )}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[12px] font-medium text-white/82 transition hover:border-white/22 hover:text-white disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                        pending
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runListingAction(
                          row.id,
                          `/api/workspaces/${workspaceId}/listings/${row.id}`,
                          {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ status: "Sold" }),
                          },
                          "Listing marked sold.",
                        )}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[12px] font-medium text-white/82 transition hover:border-white/22 hover:text-white disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Home className="h-4 w-4" />}
                        sold
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runListingAction(
                          row.id,
                          `/api/workspaces/${workspaceId}/listings/${row.id}/verify`,
                          {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({}),
                          },
                          "Listing verified.",
                        )}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/12 px-3 py-2 text-[12px] font-medium text-emerald-50 transition hover:border-emerald-200/45 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        verify
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          const nextRecheckAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
                          void runListingAction(
                            row.id,
                            `/api/workspaces/${workspaceId}/listings/${row.id}`,
                            {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({
                                verificationStatus: "needs_recheck",
                                needsRecheckAt: nextRecheckAt,
                              }),
                            },
                            "Listing marked for recheck.",
                          );
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-fuchsia-300/25 bg-fuchsia-400/12 px-3 py-2 text-[12px] font-medium text-fuchsia-50 transition hover:border-fuchsia-200/45 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        recheck
                      </button>
                      <a
                        href={card.publicUrl ?? publicListingsHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[12px] font-medium text-white/82 transition hover:border-white/22 hover:text-white"
                      >
                        <ExternalLink className="h-4 w-4" />
                        public
                      </a>
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

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="w-full max-w-[720px] gap-0 border-border bg-harwick-paper p-0 text-harwick-ink sm:max-w-[720px]">
          <SheetHeader className="border-b border-border bg-surface px-6 py-5">
            <SheetTitle className="font-display text-[28px] font-medium text-harwick-ink">
              {editorMode === "create" ? "add listing" : "edit listing"}
            </SheetTitle>
            <SheetDescription className="text-[13px] leading-6 text-muted">
              Update the listing facts Harwick uses for answers, routing, verification, and the public inventory card.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-5 pb-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">address</span>
                <input
                  value={editor.address}
                  onChange={(event) => setEditor((current) => ({ ...current, address: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="123 Main St, Houston, TX 77001"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">status</span>
                <input
                  value={editor.status}
                  onChange={(event) => setEditor((current) => ({ ...current, status: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="Active"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">price</span>
                <input
                  value={editor.price}
                  onChange={(event) => setEditor((current) => ({ ...current, price: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="450000"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">beds</span>
                <input
                  value={editor.beds}
                  onChange={(event) => setEditor((current) => ({ ...current, beds: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="4"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">baths</span>
                <input
                  value={editor.baths}
                  onChange={(event) => setEditor((current) => ({ ...current, baths: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="3"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">square feet</span>
                <input
                  value={editor.squareFeet}
                  onChange={(event) => setEditor((current) => ({ ...current, squareFeet: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="2820"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">neighborhood</span>
                <input
                  value={editor.neighborhood}
                  onChange={(event) => setEditor((current) => ({ ...current, neighborhood: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="River Oaks"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">property type</span>
                <input
                  value={editor.propertyType}
                  onChange={(event) => setEditor((current) => ({ ...current, propertyType: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="Single family"
                />
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">notes</span>
                <textarea
                  value={editor.notes}
                  onChange={(event) => setEditor((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-28 w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="Builder incentives, access instructions, visual notes..."
                />
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-subtle">incentives</span>
                <input
                  value={editor.incentives}
                  onChange={(event) => setEditor((current) => ({ ...current, incentives: event.target.value }))}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-harwick-brass/20"
                  placeholder="4.99%, closing costs, appliance package"
                />
              </label>
            </div>

            <div className="rounded-[16px] border border-border bg-surface-muted p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[13px] font-semibold">media upload</div>
                  <div className="mt-1 text-[12px] text-muted">upload photos and videos for the internal card and public listing page.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-medium text-muted transition hover:border-border-strong hover:text-foreground">
                    {isUploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
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
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-medium text-muted transition hover:border-border-strong hover:text-foreground">
                    {isUploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
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
                    <div className="truncate rounded-[12px] border border-border bg-surface px-3 py-2 text-[11px] text-muted" key={url}>
                      {url}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 text-[13px] text-muted">
              <input
                type="checkbox"
                checked={editor.hasPool}
                onChange={(event) => setEditor((current) => ({ ...current, hasPool: event.target.checked }))}
                className="h-4 w-4 rounded border-border bg-surface"
              />
              pool on site
            </label>

          </div>
          </div>
          <SheetFooter className="mt-0 flex-row justify-end border-t border-border bg-surface px-6 py-4">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-medium text-muted transition hover:border-border-strong hover:text-foreground"
            >
              cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSaveEditor()}
              className="inline-flex items-center gap-2 rounded-full bg-harwick-ink px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-70"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {editorMode === "create" ? "create listing" : "save changes"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
        </div>
      </div>
    </div>
  );
}
