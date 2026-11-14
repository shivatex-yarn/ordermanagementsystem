"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/format";
import type { ExportRow } from "@/lib/export-enquiries";

/** Turns a dashboard's period + filters into the enquiry export query, so the file holds only what is on screen. */
export function rangeQuery(days: number, from: string, to: string, divisionId: string, organizationId: string) {
  const qs = new URLSearchParams();
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (from || to) { if (from) qs.set("from", from); if (to) qs.set("to", to); }
  else { qs.set("from", day(new Date(Date.now() - days * 864e5))); qs.set("to", day(new Date())); }
  if (divisionId) qs.set("divisionId", divisionId);
  if (organizationId) qs.set("organizationId", organizationId);
  return qs.toString();
}

/** Download the enquiries matching the current filters as Excel or PDF. */
export function ExportMenu({ query, filters, generatedBy }: { query: string; filters: string[]; generatedBy: string }) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "excel" | "pdf", byDivision = false) {
    setBusy(kind);
    setError(null);
    try {
      const data = await api<{ rows: ExportRow[]; truncated: boolean }>(`/api/orders/export?${query}`);
      if (data.rows.length === 0) throw new Error("There are no enquiries to export for these filters.");
      const mod = await import("@/lib/export-enquiries");
      const meta = { generatedBy, byDivision, filters: data.truncated ? [...filters, "first 5,000 enquiries only"] : filters };
      if (kind === "excel") await mod.exportExcel(data.rows, meta);
      else await mod.exportPdf(data.rows, meta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={!!busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? "Preparing…" : "Export"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => void run("excel")}><FileSpreadsheet className="h-4 w-4 text-[var(--app-done-ink)]" />Excel (.xlsx)</DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => void run("excel", true)}><FileSpreadsheet className="h-4 w-4 text-[var(--app-done-ink)]" />Excel, division-wise</DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => void run("pdf")}><FileText className="h-4 w-4 text-[var(--app-late-ink)]" />PDF report</DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => void run("pdf", true)}><FileText className="h-4 w-4 text-[var(--app-late-ink)]" />PDF, division-wise</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <p role="alert" className="absolute right-0 top-11 z-10 w-64 rounded-xl border border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-3 py-2 text-xs text-[var(--app-late-ink)]">{error}</p> : null}
    </div>
  );
}
