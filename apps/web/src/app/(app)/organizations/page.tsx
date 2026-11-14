"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, UserPlus } from "lucide-react";
import { api } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, PanelSkeleton, EmptyState } from "@/components/ui/panel";
import { NextStep } from "@/components/ui/guidance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Org = { id: number; name: string; active: boolean; _count: { users: number } };

export default function OrganizationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ organizations: Org[] }>("/api/organizations") });
  const orgs = data?.organizations ?? [];
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["organizations"] }), qc.invalidateQueries({ queryKey: ["team"] })]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try { await api("/api/organizations", { method: "POST", json: { name } }); setName(""); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  async function toggle(o: Org) {
    setError(null);
    try { await api(`/api/organizations/${o.id}`, { method: "PATCH", json: { active: !o.active } }); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  async function remove(o: Org) {
    setError(null);
    try { await api(`/api/organizations/${o.id}`, { method: "DELETE" }); setConfirmId(null); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }

  return (
    <>
      <PageHeader title="Organizations" description="Add the companies your team belongs to. They appear as a list when you add a team member." />

      {!isLoading && orgs.length === 0 ? (
        <NextStep title="Add your first organization" description="Type a name below and press Add organization. Then pick it when adding team members." />
      ) : orgs.some((o) => o.active) ? (
        <NextStep title="Ready to assign people" description="Choose an organization in the Organization field when you add or edit a team member." actionLabel="Go to Team" onAction={() => { window.location.href = "/team"; }} />
      ) : null}

      <Panel>
        <PanelHeader title="All organizations" caption="Deactivate to hide one from the team form without losing history." />
        <form onSubmit={add} className="flex flex-wrap gap-2 border-b border-[var(--app-line-soft)] p-5">
          <Input className="max-w-xs" placeholder="New organization name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Button type="submit"><Plus className="h-4 w-4" />Add organization</Button>
          {error ? <span className="self-center text-sm text-[var(--app-late-ink)]">{error}</span> : null}
        </form>
        {isLoading ? <PanelSkeleton className="m-4 h-32" /> : orgs.length === 0 ? (
          <EmptyState icon={Building2} title="No organizations yet" description="Add one above." />
        ) : (
          <ul>
            {orgs.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-4 border-t border-[var(--app-line-soft)] px-5 py-3.5 first:border-0">
                <span className={`min-w-[8rem] flex-1 text-sm font-bold ${o.active ? "text-[var(--app-ink)]" : "text-[var(--app-ink-3)] line-through"}`}>{o.name}</span>
                <span className="text-xs text-[var(--app-ink-3)]">{o._count.users} {o._count.users === 1 ? "person" : "people"}</span>
                {confirmId === o.id ? (
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                    <span className="text-xs text-[var(--app-late-ink)]">{o._count.users > 0 ? `${o._count.users} people will be left without an organization. Delete?` : "Delete this organization?"}</span>
                    <Button variant="destructive" size="sm" onClick={() => void remove(o)}>Yes, delete</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>Keep</Button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void toggle(o)}>{o.active ? "Deactivate" : "Activate"}</Button>
                    <Button variant="ghost" size="sm" className="text-[var(--app-late-ink)] hover:text-[var(--app-late-ink)]" onClick={() => setConfirmId(o.id)}>Delete</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="px-1 text-xs text-[var(--app-ink-3)]"><UserPlus className="mr-1 inline h-3.5 w-3.5" />Prefer to work from people? <Link href="/team" className="font-semibold text-[var(--app-brand)]">Open Team</Link>.</p>
    </>
  );
}
