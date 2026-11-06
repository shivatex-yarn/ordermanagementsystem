"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, FlaskConical, Hourglass, ListChecks } from "lucide-react";
import { api, fmtDate, fmtMoney } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, PanelLink, PanelSkeleton, EmptyState } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

type Overview = {
  byStatus: Record<string, number>;
  byDivision: { name: string; count: number }[];
  samples: number;
  recent: { id: number; orderNumber: string; status: string; enquiryDate: string; customerName: string; companyName: string | null; pricePerUnit: string | null; priceUnit: string | null; division: { name: string } }[];
  feedback: { id: number; orderNumber: string; customerName: string; companyName: string | null; clientFeedback: string | null; clientResponse: string | null; clientFeedbackAt: string | null; division: { name: string } }[];
};

function Tile({ label, value, icon: Icon, tone, href }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string; href: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5 transition-colors hover:border-[var(--app-brand-line)]">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone)}><Icon className="h-5 w-5" aria-hidden /></span>
      <p className="tnum mt-4 text-3xl font-extrabold tracking-tight text-[var(--app-ink)]">{value}</p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--app-ink-2)]">{label}</p>
    </Link>
  );
}

export default function OverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/api/overview"), staleTime: 30_000 });
  if (isLoading || !data) return <PanelSkeleton className="h-96" />;
  const s = data.byStatus;
  const max = Math.max(1, ...data.byDivision.map((d) => d.count));
  return (
    <>
      <PageHeader title="Overview" description="Every division at a glance. Read-only." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Needs pricing" value={s.PLACED ?? 0} icon={CircleDashed} tone="bg-[var(--app-act-bg)] text-[var(--app-act-ink)]" href="/orders?status=PLACED" />
        <Tile label="Waiting for client" value={s.PRICED ?? 0} icon={Hourglass} tone="bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]" href="/orders?status=PRICED" />
        <Tile label="Closed" value={s.CLOSED ?? 0} icon={CheckCircle2} tone="bg-[var(--app-done-bg)] text-[var(--app-done-ink)]" href="/orders?status=CLOSED" />
        <Tile label="Sample requests" value={data.samples} icon={FlaskConical} tone="bg-[var(--app-brand-tint)] text-[var(--app-brand)]" href="/orders" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Enquiries by division" />
          {data.byDivision.length === 0 ? <EmptyState icon={ListChecks} title="No enquiries yet" description="Numbers appear once Marketing logs the first one." /> : (
            <ul className="space-y-4 p-5">
              {data.byDivision.map((d) => (
                <li key={d.name}>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold text-[var(--app-ink)]">{d.name}</span><span className="tnum text-[var(--app-ink-2)]">{d.count}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--app-surface-sunk)]"><div className="h-full rounded-full bg-[var(--app-brand)]" style={{ width: `${(d.count / max) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Latest client feedback" />
          {data.feedback.length === 0 ? <p className="p-5 text-sm text-[var(--app-ink-3)]">No feedback recorded yet.</p> : (
            <ul className="divide-y divide-[var(--app-line-soft)]">
              {data.feedback.map((f) => (
                <li key={f.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3"><Link href={`/orders/${f.id}`} className="text-sm font-bold text-[var(--app-brand)] hover:underline">{f.orderNumber}</Link><span className="text-[11px] text-[var(--app-ink-3)]">{f.division.name} · {fmtDate(f.clientFeedbackAt)}</span></div>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--app-ink-2)]">{f.clientFeedback}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Latest enquiries" action={<PanelLink href="/orders">All enquiries</PanelLink>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {data.recent.map((o) => (
                <tr key={o.id} className="border-t border-[var(--app-line-soft)] first:border-0">
                  <td className="px-5 py-3.5"><Link href={`/orders/${o.id}`} className="whitespace-nowrap font-bold text-[var(--app-brand)] hover:underline">{o.orderNumber}</Link></td>
                  <td className="px-3 py-3.5 font-semibold text-[var(--app-ink)]">{o.companyName || o.customerName}</td>
                  <td className="px-3 py-3.5 text-[var(--app-ink-2)]">{o.division.name}</td>
                  <td className="tnum whitespace-nowrap px-3 py-3.5 text-[var(--app-ink-2)]">{fmtDate(o.enquiryDate)}</td>
                  <td className="tnum px-3 py-3.5 text-[var(--app-ink-2)]">{o.pricePerUnit ? `${fmtMoney(o.pricePerUnit)} / ${o.priceUnit}` : "—"}</td>
                  <td className="px-5 py-3.5"><StatusPill status={o.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
