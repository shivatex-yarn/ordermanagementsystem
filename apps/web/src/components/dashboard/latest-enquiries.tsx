"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api, fmtDate, fmtMoney } from "@/lib/format";
import { Panel, PanelHeader, PanelLink, EmptyState } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

type Row = { id: number; orderNumber: string; status: string; enquiryDate: string; customerName: string; companyName: string | null; pricePerUnit: string | null; priceUnit: string | null; division: { name: string } };
type Data = { orders: Row[]; total: number; page: number; pageSize: number };

/** Newest enquiries, 5 per page, within whatever the person is allowed to see. */
export function LatestEnquiries({ division, dateFrom, dateTo }: { division?: string; dateFrom?: string; dateTo?: string }) {
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ["orders", "latest", page, division ?? "", dateFrom ?? "", dateTo ?? ""],
    queryFn: () => api<Data>(`/api/orders?pageSize=5&page=${page}${division ? `&divisionId=${division}` : ""}${dateFrom ? `&from=${dateFrom}` : ""}${dateTo ? `&to=${dateTo}` : ""}`),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total ? (page - 1) * 5 + 1 : 0;
  const to = data ? Math.min(data.total, page * 5) : 0;

  return (
    <Panel>
      <PanelHeader title="Latest enquiries" action={<PanelLink href="/orders">All enquiries</PanelLink>} />
      {!data || data.orders.length === 0 ? (
        <EmptyState title="No enquiries yet" description="Enquiries logged by Marketing appear here." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-t border-[var(--app-line-soft)] first:border-0">
                    <td className="whitespace-nowrap px-5 py-3.5"><Link href={`/orders/${o.id}`} className="font-bold text-[var(--app-brand)] hover:underline">{o.orderNumber}</Link></td>
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-line-soft)] px-5 py-3 text-sm">
            <p className="tnum text-[var(--app-ink-3)]">Showing {from}–{to} of {data.total}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page" className="rounded-lg border border-[var(--app-line)] p-2 hover:bg-[var(--app-surface-sunk)] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="tnum px-3 text-xs font-semibold text-[var(--app-ink-2)]">Page {page} of {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Next page" className="rounded-lg border border-[var(--app-line)] p-2 hover:bg-[var(--app-surface-sunk)] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
