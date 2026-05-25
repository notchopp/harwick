import {
  PiBrainFill,
  PiCompassFill,
  PiHandPalmFill,
  PiMapPinFill,
  PiScalesFill,
  PiSparkleFill,
} from "react-icons/pi";

import { Card, Section, Shell } from "../../components/panels/panels";
import { MicroLabel, MonoTag } from "../../components/panels/typography";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";
import { createSupabaseWorkspaceMemoryRepository } from "../../lib/supabase/workspace-memory";
import { cn } from "../../lib/utils";
import {
  formatConfidence,
  formatLastObserved,
  groupMemoriesByType,
  type MemoryGroup,
} from "./memory-data";

const MEMORY_LIMIT = 50;

type MemoryPageContentProps = {
  workspaceId: string;
  workspaceName: string;
};

type MemoryTone = {
  /** background fill behind the type badge */
  badgeBg: string;
  /** badge text colour */
  badgeText: string;
  /** small dot used in the section header */
  dot: string;
};

const TONE: Record<MemoryGroup["key"], MemoryTone> = {
  pattern: {
    badgeBg: "bg-[color:var(--sage-soft)]",
    badgeText: "text-[color:var(--sage)]",
    dot: "bg-[color:var(--sage)]",
  },
  routing: {
    badgeBg: "bg-[color:var(--harwick-brass-soft)]",
    badgeText: "text-[color:var(--harwick-brass)]",
    dot: "bg-[color:var(--harwick-brass)]",
  },
  objection: {
    badgeBg: "bg-[color:var(--clay-soft)]",
    badgeText: "text-[color:var(--clay)]",
    dot: "bg-[color:var(--clay)]",
  },
  market: {
    badgeBg: "bg-[color:var(--panel-3)]",
    badgeText: "text-[color:var(--graphite-text)]",
    dot: "bg-[color:var(--graphite-text-muted)]",
  },
  policy_signal: {
    badgeBg: "bg-[color:var(--oxblood-soft)]",
    badgeText: "text-[color:var(--oxblood)]",
    dot: "bg-[color:var(--oxblood)]",
  },
  other: {
    badgeBg: "bg-[color:var(--panel-3)]",
    badgeText: "text-[color:var(--graphite-text-muted)]",
    dot: "bg-[color:var(--graphite-text-faint)]",
  },
};

function GroupIcon({ groupKey }: { groupKey: MemoryGroup["key"] }) {
  const className = "size-3.5";
  if (groupKey === "pattern") return <PiSparkleFill aria-hidden="true" className={className} />;
  if (groupKey === "routing") return <PiCompassFill aria-hidden="true" className={className} />;
  if (groupKey === "objection") return <PiHandPalmFill aria-hidden="true" className={className} />;
  if (groupKey === "market") return <PiMapPinFill aria-hidden="true" className={className} />;
  if (groupKey === "policy_signal") return <PiScalesFill aria-hidden="true" className={className} />;
  return <PiBrainFill aria-hidden="true" className={className} />;
}

function MemoryGroupSection({ group, now }: { group: MemoryGroup; now: Date }) {
  const tone = TONE[group.key];

  return (
    <Section
      eyebrow={`${group.documents.length} ${group.documents.length === 1 ? "memory" : "memories"}`}
      title={
        <span className="flex items-center gap-2">
          <span className={cn("inline-flex size-5 items-center justify-center rounded-[6px]", tone.badgeBg, tone.badgeText)}>
            <GroupIcon groupKey={group.key} />
          </span>
          <span className="capitalize">{group.label}</span>
        </span>
      }
      trailing={<MonoTag>{group.documents.length}</MonoTag>}
      bodyClassName="p-3"
    >
      <p className="mb-3 px-1 text-[12px] leading-[1.55] text-[color:var(--graphite-text-muted)]">{group.description}</p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {group.documents.map((doc) => (
          <Card className="flex flex-col gap-3 p-4" key={doc.id}>
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                  tone.badgeBg,
                  tone.badgeText,
                )}
              >
                <span className={cn("inline-block size-1.5 rounded-full", tone.dot)} aria-hidden="true" />
                {group.label}
              </span>
              <MonoTag>{formatConfidence(doc.confidence)} confidence</MonoTag>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold leading-[1.35] tracking-[-0.005em] text-[color:var(--graphite-text)]">
                {doc.title}
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[color:var(--graphite-text-muted)]">{doc.body}</p>
            </div>
            <div className="flex items-center justify-between border-t border-[color:var(--panel-line-soft)] pt-2.5">
              <MicroLabel>last observed</MicroLabel>
              <span className="font-mono text-[10.5px] text-[color:var(--graphite-text-muted)]">
                {formatLastObserved(doc.lastObservedAt, now)}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function EmptyMemoryState() {
  return (
    <Shell className="px-6 py-12" tone="flat">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-[14px] bg-[color:var(--panel-3)] text-[color:var(--graphite-text-muted)]">
          <PiBrainFill aria-hidden="true" className="size-5" />
        </span>
        <h2 className="mt-4 font-display text-[20px] font-semibold tracking-[-0.015em] text-[color:var(--graphite-text)]">
          nothing here yet
        </h2>
        <p className="mt-2 text-[13px] leading-[1.55] text-[color:var(--graphite-text-muted)]">
          harwick hasn&apos;t observed anything memorable yet — every captured lead and conversation feeds this surface.
          patterns, routing habits, common objections, and house rules will show up here once there&apos;s enough signal.
        </p>
      </div>
    </Shell>
  );
}

export async function MemoryPageContent(props: MemoryPageContentProps) {
  const repository = createSupabaseWorkspaceMemoryRepository(createServerSupabaseClient());
  const documents = await repository.listRuntimeMemoryDocuments({
    workspaceId: props.workspaceId,
    limit: MEMORY_LIMIT,
  });
  const groups = groupMemoriesByType(documents);
  const now = new Date();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[color:var(--panel-1)] text-[color:var(--graphite-text)]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--panel-line-soft)] px-5 py-4 md:px-6 md:py-5">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <MicroLabel>{props.workspaceName} · memory</MicroLabel>
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.02] tracking-[-0.025em] text-[color:var(--graphite-text)] md:text-[42px]">
            what harwick has noticed
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-[1.55] text-[color:var(--graphite-text-muted)]">
            distilled from your real leads, conversations, and operator decisions. harwick references these when drafting
            replies, routing work, and writing artifacts. the more you operate, the sharper this gets.
          </p>
        </div>
        {documents.length === 0 ? null : (
          <div className="flex items-center gap-2">
            <MonoTag>{documents.length} active</MonoTag>
          </div>
        )}
      </header>

      <div className="space-y-4 px-5 py-4 md:px-6 md:py-5">
        {groups.length === 0 ? (
          <EmptyMemoryState />
        ) : (
          groups.map((group) => <MemoryGroupSection group={group} key={group.key} now={now} />)
        )}
      </div>
    </div>
  );
}
