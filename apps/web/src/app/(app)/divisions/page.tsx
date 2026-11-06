"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, fmtDate } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, PanelSkeleton } from "@/components/ui/panel";
import { NextStep } from "@/components/ui/guidance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { StatusBadge } from "./status-badge";

type Division = { id: number; name: string; active: boolean; _count: { orders: number; users: number } };
type Req = { id: number; reason: string; status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: string; decisionNote: string | null; user: { name: string; role: string }; division: { name: string } };

function RequestAccess({ divisions, mine }: { divisions: Division[]; mine: number[] }) {
  const qc = useQueryClient();
  const [divisionId, setDivisionId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = divisions.filter((d) => d.active && !mine.includes(d.id));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!divisionId) return setError("Pick a division");
    setBusy(true); setError(null);
    try {
      await api("/api/access-requests", { method: "POST", json: { divisionId, reason } });
      setReason(""); setDivisionId("");
      await qc.invalidateQueries({ queryKey: ["access-requests"] });
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  if (!options.length) return <p className="p-5 text-sm text-[var(--app-ink-3)]">You already have every division.</p>;
  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <Field label="Division">
        <div className="flex flex-wrap gap-2">
          {options.map((d) => (
            <button key={d.id} type="button" aria-pressed={divisionId === d.id} onClick={() => setDivisionId(d.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${divisionId === d.id ? "border-[var(--app-brand)] bg-[var(--app-brand)] text-white" : "border-[var(--app-line)] bg-white text-[var(--app-ink-2)] hover:border-[var(--app-brand-line)]"}`}>{d.name}</button>
          ))}
        </div>
      </Field>
      <Field label="Why do you need it?"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I handle Garments clients too" required /></Field>
      <FormError message={error} />
      <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send request to admin"}</Button></div>
    </form>
  );
}

export default function DivisionsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admin = user?.role === "SUPER_ADMIN";
  const { data: dv, isLoading } = useQuery({ queryKey: ["divisions"], queryFn: () => api<{ divisions: Division[] }>("/api/divisions") });
  const { data: rq } = useQuery({ queryKey: ["access-requests"], queryFn: () => api<{ requests: Req[] }>("/api/access-requests"), enabled: !!user });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const divisions = dv?.divisions ?? [];
  const requests = rq?.requests ?? [];
  const pending = requests.filter((r) => r.status === "PENDING");
  const mine = user?.divisions.map((d) => d.id) ?? [];

  async function add(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try { await api("/api/divisions", { method: "POST", json: { name } }); setName(""); await qc.invalidateQueries({ queryKey: ["divisions"] }); }
    catch (err) { setError((err as Error).message); }
  }
  async function decide(id: number, decision: "APPROVED" | "REJECTED") {
    await api(`/api/access-requests/${id}`, { method: "PATCH", json: { decision } });
    await Promise.all([qc.invalidateQueries({ queryKey: ["access-requests"] }), qc.invalidateQueries({ queryKey: ["team"] })]);
  }
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  async function remove(d: Division) {
    setRowError(null);
    try {
      await api(`/api/divisions/${d.id}`, { method: "DELETE" });
      setConfirmId(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["divisions"] }), qc.invalidateQueries({ queryKey: ["team"] })]);
    } catch (err) {
      setRowError((err as Error).message);
    }
  }
  async function toggle(d: Division) {
    await api(`/api/divisions/${d.id}`, { method: "PATCH", json: { active: !d.active } });
    await qc.invalidateQueries({ queryKey: ["divisions"] });
  }

  return (
    <>
      <PageHeader title="Divisions" description={admin ? "Manage divisions and decide who gets access to more than one." : "The divisions you work in, and how to ask for more."} />

      {admin && pending.length > 0 ? <NextStep title={`${pending.length} access ${pending.length === 1 ? "request needs" : "requests need"} your decision`} description="Approving gives that person the division straight away." /> : null}

      {admin ? (
        <Panel>
          <PanelHeader title={`Access requests${pending.length ? ` (${pending.length})` : ""}`} caption="Marketing and Sales ask here for more divisions. Only you can approve." />
          {requests.length === 0 ? <p className="p-5 text-sm text-[var(--app-ink-3)]">No requests yet.</p> : (
            <ul>
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--app-line-soft)] px-5 py-3.5 first:border-0">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-bold text-[var(--app-ink)]">{r.user.name} <span className="font-normal text-[var(--app-ink-3)]">wants</span> {r.division.name}</p>
                    <p className="text-xs text-[var(--app-ink-2)]">{r.reason} · {fmtDate(r.createdAt)}</p>
                  </div>
                  {r.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void decide(r.id, "APPROVED")}><Check className="h-3.5 w-3.5" />Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => void decide(r.id, "REJECTED")}><X className="h-3.5 w-3.5" />Decline</Button>
                    </div>
                  ) : <StatusBadge status={r.status} />}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <>
          <Panel>
            <PanelHeader title="Your divisions" caption="You see and work on enquiries in these." />
            <div className="flex flex-wrap gap-2 p-5">
              {user?.divisions.length ? user.divisions.map((d) => <span key={d.id} className="rounded-full bg-[var(--app-brand-tint)] px-3.5 py-1.5 text-sm font-semibold text-[var(--app-brand)]">{d.name}</span>) : <p className="text-sm text-[var(--app-ink-3)]">The admin hasn&apos;t mapped you to a division yet. Send a request below.</p>}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Request another division" caption="The Super admin approves or declines." />
            <RequestAccess divisions={divisions} mine={mine} />
          </Panel>
          {requests.length > 0 ? (
            <Panel>
              <PanelHeader title="Your requests" />
              <ul>{requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-t border-[var(--app-line-soft)] px-5 py-3.5 first:border-0">
                  <span className="text-sm font-semibold text-[var(--app-ink)]">{r.division.name} <span className="font-normal text-[var(--app-ink-3)]">· {fmtDate(r.createdAt)}</span></span><StatusBadge status={r.status} />
                </li>))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}

      {admin ? (
        <Panel>
          <PanelHeader title="All divisions" caption="Names show up on enquiries and in each person's access." />
          <form onSubmit={add} className="flex flex-wrap gap-2 border-b border-[var(--app-line-soft)] p-5">
            <Input className="max-w-xs" placeholder="New division name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Button type="submit"><Plus className="h-4 w-4" />Add division</Button>
            {error ? <span className="self-center text-sm text-[var(--app-late-ink)]">{error}</span> : null}
          </form>
          {rowError ? <p className="border-b border-[var(--app-line-soft)] px-5 py-3 text-sm text-[var(--app-late-ink)]">{rowError}</p> : null}
          {isLoading ? <PanelSkeleton className="m-4 h-32" /> : (
            <ul>{divisions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-4 border-t border-[var(--app-line-soft)] px-5 py-3.5 first:border-0">
                <span className={`min-w-[8rem] flex-1 text-sm font-bold ${d.active ? "text-[var(--app-ink)]" : "text-[var(--app-ink-3)] line-through"}`}>{d.name}</span>
                <span className="text-xs text-[var(--app-ink-3)]">{d._count.users} people · {d._count.orders} enquiries</span>
                {confirmId === d.id ? (
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                    <span className="text-xs text-[var(--app-late-ink)]">
                      {d._count.orders > 0 ? "Has enquiries. Deactivate instead." : d._count.users > 0 ? `Removes access for ${d._count.users} people. Delete?` : "Delete this division?"}
                    </span>
                    {d._count.orders === 0 ? <Button variant="destructive" size="sm" onClick={() => void remove(d)}>Yes, delete</Button> : null}
                    <Button variant="ghost" size="sm" onClick={() => { setConfirmId(null); setRowError(null); }}>Keep</Button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void toggle(d)}>{d.active ? "Deactivate" : "Activate"}</Button>
                    <Button variant="ghost" size="sm" className="text-[var(--app-late-ink)] hover:text-[var(--app-late-ink)]" onClick={() => { setConfirmId(d.id); setRowError(null); }}>Delete</Button>
                  </div>
                )}
              </li>))}
            </ul>
          )}
        </Panel>
      ) : null}
    </>
  );
}
