"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2, Clock } from "lucide-react";
import { Panel, PanelHeader, PageHeader, EmptyState, PanelSkeleton } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat-tile";
import { Callout, NextStep } from "@/components/ui/guidance";
import { formatEnquiryNumberShort } from "@/lib/enquiry-display";

type OrderAtRisk = { id: number; orderNumber: string; slaDeadline: string };

type SlaBreachListItem = {
  id: number;
  breachedAt: string;
  headRejectedAt?: string | null;
  headRejectionMessage?: string | null;
  headRejectedBy?: { name?: string | null } | null;
  division?: { name?: string | null } | null;
  order?: { id?: number | null; orderNumber?: string | null } | null;
};

async function fetchSla(): Promise<{ breaches: SlaBreachListItem[]; ordersAtRisk: OrderAtRisk[] }> {
  const res = await fetch("/api/sla", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch SLA data");
  return res.json();
}

const PAGE_SIZE = 6;

function when(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function daysLate(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function Pager({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-line-soft)] px-5 py-3">
      <p className="tnum text-xs text-[var(--app-ink-3)]">
        Page {page} of {pages} · {total} in total
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-line)] text-[var(--app-ink-2)] disabled:opacity-40 hover:enabled:bg-[var(--app-surface-sunk)]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(Math.min(pages, page + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-line)] text-[var(--app-ink-2)] disabled:opacity-40 hover:enabled:bg-[var(--app-surface-sunk)]"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default function SLAPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sla"],
    queryFn: fetchSla,
  });

  const breaches = useMemo(() => data?.breaches ?? [], [data]);
  const ordersAtRisk = useMemo(() => data?.ordersAtRisk ?? [], [data]);

  const [breachesPage, setBreachesPage] = useState(1);
  const [riskPage, setRiskPage] = useState(1);

  const breachesTotalPages = Math.max(1, Math.ceil(breaches.length / PAGE_SIZE));
  const riskTotalPages = Math.max(1, Math.ceil(ordersAtRisk.length / PAGE_SIZE));

  useEffect(() => {
    setBreachesPage((p) => Math.min(p, breachesTotalPages));
  }, [breachesTotalPages]);
  useEffect(() => {
    setRiskPage((p) => Math.min(p, riskTotalPages));
  }, [riskTotalPages]);

  const breachesSlice = useMemo(
    () => breaches.slice((breachesPage - 1) * PAGE_SIZE, breachesPage * PAGE_SIZE),
    [breaches, breachesPage]
  );
  const riskSlice = useMemo(
    () => ordersAtRisk.slice((riskPage - 1) * PAGE_SIZE, riskPage * PAGE_SIZE),
    [ordersAtRisk, riskPage]
  );

  /** A breach with no explanation from the division head is the thing to chase. */
  const unexplained = breaches.filter((b) => !b.headRejectedAt);

  return (
    <div className="space-y-5">
      <PageHeader
        title="SLA & breaches"
        description="Enquiries that have passed their deadline, and the explanations division heads have given."
      />

      {error ? (
        <Callout tone="late" title="Could not load SLA data">
          Something went wrong fetching the breach list. Reload the page in a moment.
        </Callout>
      ) : null}

      {!isLoading && !error ? (
        unexplained.length > 0 ? (
          <NextStep
            tone="late"
            eyebrow="Needs an explanation"
            title={`${unexplained.length} breach${unexplained.length === 1 ? "" : "es"} with no reason recorded`}
            description="The division head has not yet said why these ran late. Until they do, the breach stays open on the record."
            actionLabel="Open the first one"
            actionHref={unexplained[0].order?.id ? `/orders/${unexplained[0].order.id}` : "/orders"}
          />
        ) : ordersAtRisk.length > 0 ? (
          <NextStep
            tone="late"
            eyebrow="Past deadline"
            title={`${ordersAtRisk.length} open enquir${ordersAtRisk.length === 1 ? "y is" : "ies are"} already late`}
            description="These have passed their SLA date and are still moving. Chase the division currently holding each one."
            actionLabel="Open the oldest"
            actionHref={`/orders/${ordersAtRisk[0].id}`}
          />
        ) : breaches.length === 0 ? (
          <NextStep
            tone="done"
            eyebrow="All clear"
            title="Nothing has breached its deadline"
            description="Every open enquiry is still inside its SLA window."
            actionLabel="Browse enquiries"
            actionHref="/orders"
          />
        ) : null
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Recorded breaches"
          value={breaches.length}
          caption="Deadlines that were missed"
          icon={AlertTriangle}
          tone={breaches.length > 0 ? "late" : "done"}
          loading={isLoading}
        />
        <StatTile
          label="Awaiting an explanation"
          value={unexplained.length}
          caption={unexplained.length > 0 ? "Division head has not responded" : "All breaches explained"}
          icon={Clock}
          tone={unexplained.length > 0 ? "act" : "done"}
          loading={isLoading}
        />
        <StatTile
          label="Currently past deadline"
          value={ordersAtRisk.length}
          caption="Still open and already late"
          icon={AlertTriangle}
          tone={ordersAtRisk.length > 0 ? "late" : "done"}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Breach record"
            caption="Each missed deadline and what the division head said about it"
          />
          {isLoading ? (
            <div className="space-y-2 p-5">
              <PanelSkeleton className="h-20" />
              <PanelSkeleton className="h-20" />
            </div>
          ) : !breaches.length ? (
            <EmptyState
              icon={CheckCircle2}
              title="No breaches recorded"
              description="Nothing has missed its deadline since records began."
            />
          ) : (
            <>
              <ul className="divide-y divide-[var(--app-line-soft)]">
                {breachesSlice.map((b) => (
                  <li key={b.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {b.order?.id != null ? (
                        <Link
                          href={`/orders/${b.order.id}`}
                          className="tnum text-sm font-bold text-[var(--app-brand)] hover:underline"
                        >
                          {formatEnquiryNumberShort(b.order.orderNumber ?? "")}
                        </Link>
                      ) : (
                        <span className="tnum text-sm font-bold text-[var(--app-ink)]">
                          {b.order?.orderNumber ?? "—"}
                        </span>
                      )}
                      <span className="tnum rounded-full border border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-late-ink)]">
                        Breached {when(b.breachedAt)}
                      </span>
                    </div>
                    {b.division?.name ? (
                      <p className="mt-1 text-xs text-[var(--app-ink-3)]">{b.division.name}</p>
                    ) : null}

                    {b.headRejectedAt ? (
                      <div className="mt-2.5 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)] px-3 py-2.5">
                        <p className="text-xs font-bold text-[var(--app-ink-2)]">
                          Explained by {b.headRejectedBy?.name ?? "the division head"} on{" "}
                          <span className="tnum">{when(b.headRejectedAt)}</span>
                        </p>
                        {b.headRejectionMessage ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--app-ink-2)]">
                            {b.headRejectionMessage}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2.5 rounded-xl border border-[var(--app-act-line)] bg-[var(--app-act-bg)] px-3 py-2 text-xs font-bold text-[var(--app-act-ink)]">
                        Waiting for the division head to record why this ran late.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <Pager
                page={breachesPage}
                pages={breachesTotalPages}
                total={breaches.length}
                onChange={setBreachesPage}
              />
            </>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Open and already late"
            caption="Enquiries still in flight that have passed their deadline"
          />
          {isLoading ? (
            <div className="space-y-2 p-5">
              <PanelSkeleton className="h-14" />
              <PanelSkeleton className="h-14" />
            </div>
          ) : !ordersAtRisk.length ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing is late"
              description="Every open enquiry is still inside its SLA window."
            />
          ) : (
            <>
              <ul className="divide-y divide-[var(--app-line-soft)]">
                {riskSlice.map((o) => {
                  const late = daysLate(o.slaDeadline);
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                      <Link
                        href={`/orders/${o.id}`}
                        className="tnum min-w-0 flex-1 text-sm font-bold text-[var(--app-brand)] hover:underline"
                      >
                        {formatEnquiryNumberShort(o.orderNumber)}
                      </Link>
                      <span className="text-xs text-[var(--app-ink-3)]">due {when(o.slaDeadline)}</span>
                      <span className="tnum shrink-0 rounded-full border border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-late-ink)]">
                        {late === 0 ? "Due today" : `${late} day${late === 1 ? "" : "s"} late`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Pager
                page={riskPage}
                pages={riskTotalPages}
                total={ordersAtRisk.length}
                onChange={setRiskPage}
              />
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
