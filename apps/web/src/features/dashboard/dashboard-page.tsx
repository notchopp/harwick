import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  MapPin,
  MoreHorizontal,
  PhoneForwarded,
} from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  integrations,
  leads,
  metrics,
  pipelineStages,
  voiceAgentSetup,
  workflowSteps,
  type Lead,
  type Metric,
  type PipelineStage,
  type VoiceAgentSetup,
} from "./dashboard-data";

const statusLabel: Record<Lead["status"], string> = {
  hot: "hot",
  qualified: "qualified",
  syncing: "syncing",
  warm: "warm",
};

function MetricTile(props: { metric: Metric }) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 shadow-[0_10px_36px_rgba(24,24,22,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted">{props.metric.label}</p>
        <Badge tone={props.metric.tone}>{props.metric.note}</Badge>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-[-0.02em]">
        {props.metric.value}
      </p>
    </section>
  );
}

function LeadRow(props: { lead: Lead }) {
  const Icon = props.lead.channelIcon;

  return (
    <article className="grid gap-4 border-b border-border px-4 py-4 last:border-b-0 xl:grid-cols-[1.15fr_0.8fr_0.55fr_0.55fr_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-muted">
            <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{props.lead.name}</h3>
            <p className="text-xs text-muted">{props.lead.channel}</p>
          </div>
          <Badge tone={props.lead.status}>{statusLabel[props.lead.status]}</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">{props.lead.summary}</p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          intent
        </p>
        <p className="mt-1 text-sm font-medium">{props.lead.intent}</p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          score
        </p>
        <p className="mt-1 text-sm font-semibold">{props.lead.score}</p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          owner
        </p>
        <p className="mt-1 text-sm font-medium">{props.lead.assignee}</p>
      </div>

      <div className="flex items-center justify-between gap-3 xl:justify-end">
        <Badge tone={props.lead.status === "hot" ? "hot" : "neutral"}>
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          {props.lead.sla}
        </Badge>
        <Button variant="secondary" size="sm">
          Open
        </Button>
      </div>
    </article>
  );
}

function VoiceAgentSetupPanel(props: { setup: VoiceAgentSetup }) {
  return (
    <section className="border border-border bg-surface p-4 shadow-[0_12px_36px_rgba(24,24,22,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            call agent
          </p>
          <h2 className="mt-1 text-xl font-semibold">setup</h2>
        </div>
        <Badge tone={props.setup.status === "ready" ? "qualified" : "neutral"}>
          {props.setup.status}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3">
        <div className="border-b border-border pb-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            service areas
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {props.setup.serviceAreas.map((area) => (
              <Badge key={area} tone="neutral">{area}</Badge>
            ))}
          </div>
        </div>

        <div className="border-b border-border pb-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
            <PhoneForwarded className="h-3.5 w-3.5" aria-hidden="true" />
            human handoff
          </div>
          <p className="mt-2 text-sm font-medium">{props.setup.transferNumber}</p>
        </div>

        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">agent status</span>
            <span className="font-medium">{props.setup.lastSync}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted">next</span>
            <span className="max-w-52 text-right font-medium leading-5">
              {props.setup.nextStep}
            </span>
          </div>
        </div>

        <Button className="w-full" disabled>
          Create call agent
        </Button>
      </div>
    </section>
  );
}

export function DashboardPage(props: {
  liveLeads?: Lead[];
  liveMetrics?: Metric[];
  livePipelineStages?: PipelineStage[];
} = {}) {
  const queueLeads = props.liveLeads ?? leads;
  const pageMetrics = props.liveMetrics ?? metrics;
  const stages = props.livePipelineStages ?? pipelineStages;

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {pageMetrics.map((metric) => (
            <MetricTile key={metric.label} metric={metric} />
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-[0_16px_50px_rgba(24,24,22,0.06)]">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  today
                </p>
                <h2 className="mt-1 text-xl font-semibold">lead work queue</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm">
                  Instagram first
                </Button>
                <Button variant="ghost" size="sm">
                  Needs assignment
                </Button>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  More
                </Button>
              </div>
            </div>

            <div>
              {queueLeads.map((lead) => (
                <LeadRow key={lead.name} lead={lead} />
              ))}
            </div>
          </div>

          <aside className="space-y-5">
            <VoiceAgentSetupPanel setup={voiceAgentSetup} />

            <section className="rounded-[1.75rem] border border-border bg-surface p-4 shadow-[0_16px_50px_rgba(24,24,22,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                    operating spine
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">capture to FUB</h2>
                </div>
                <Badge tone="qualified">live model</Badge>
              </div>
              <div className="mt-5 space-y-3">
                {workflowSteps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div
                      className="flex items-center justify-between rounded-2xl border border-border bg-surface-muted/55 px-3 py-3"
                      key={step.label}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
                          <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
                        </span>
                        <p className="text-sm font-medium">{step.label}</p>
                      </div>
                      <span className="text-xs font-medium text-muted">
                        0{index + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-border bg-surface p-4 shadow-[0_16px_50px_rgba(24,24,22,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                    connections
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">integration health</h2>
                </div>
                <ArrowUpRight className="h-5 w-5 text-muted" aria-hidden="true" />
              </div>
              <div className="mt-5 space-y-3">
                {integrations.map((integration) => (
                  <div
                    className="rounded-2xl border border-border bg-surface-muted/45 p-3"
                    key={integration.name}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{integration.name}</p>
                      <Badge tone={integration.state}>{integration.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {integration.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          {stages.map((stage) => (
            <article
              className="rounded-[1.5rem] border border-border bg-surface p-4"
              key={stage.label}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{stage.label}</h3>
                <CheckCircle2 className="h-4 w-4 text-muted" aria-hidden="true" />
              </div>
              <p className="mt-4 text-3xl font-semibold">{stage.count}</p>
              <p className="mt-2 text-sm text-muted">{stage.detail}</p>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
