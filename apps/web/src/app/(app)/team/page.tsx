"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus, X } from "lucide-react";
import { api } from "@/lib/format";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/roles";
import { PageHeader, Panel, PanelHeader, PanelSkeleton, EmptyState } from "@/components/ui/panel";
import { NextStep } from "@/components/ui/guidance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FormError, selectClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Person = { id: number; name: string; email: string; phone: string | null; role: string; active: boolean; divisions: { id: number; name: string }[] };
type Division = { id: number; name: string; active: boolean };

function DivisionPicker({ all, value, onChange }: { all: Division[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {all.filter((d) => d.active).map((d) => {
        const on = value.includes(d.id);
        return (
          <button key={d.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d.id) : [...value, d.id])}
            className={cn("rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors", on ? "border-[var(--app-brand)] bg-[var(--app-brand)] text-white" : "border-[var(--app-line)] bg-white text-[var(--app-ink-2)] hover:border-[var(--app-brand-line)]")}>
            {d.name}
          </button>
        );
      })}
    </div>
  );
}

function PersonForm({ person, divisions, onDone }: { person?: Person; divisions: Division[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: person?.name ?? "", email: person?.email ?? "", phone: person?.phone ?? "", password: "", role: person?.role ?? "MARKETING" });
  const [divs, setDivs] = useState<number[]>(person?.divisions.map((d) => d.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const needsDivisions = f.role === "MARKETING" || f.role === "SALES";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (person) {
        await api(`/api/team/${person.id}`, { method: "PATCH", json: { name: f.name, email: f.email, phone: f.phone || null, role: f.role, ...(f.password ? { password: f.password } : {}), divisionIds: needsDivisions ? divs : [] } });
      } else {
        await api("/api/team", { method: "POST", json: { ...f, divisionIds: needsDivisions ? divs : [] } });
      }
      await qc.invalidateQueries({ queryKey: ["team"] });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 border-b border-[var(--app-line-soft)] bg-[var(--app-surface-sunk)] p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input required value={f.name} onChange={set("name")} /></Field>
        <Field label="Role"><select className={selectClass} value={f.role} onChange={set("role")}>{ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
        <Field label="Email"><Input required type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Phone" optional><Input inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label={person ? "New password" : "Password"} optional={!!person} hint={person ? "Leave blank to keep the current one." : "At least 8 characters. Share it with them."}>
          <Input type="password" minLength={8} required={!person} value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
      </div>
      {needsDivisions ? (
        <Field label="Divisions they can work in" hint="They only see and log enquiries for these divisions.">
          <DivisionPicker all={divisions} value={divs} onChange={setDivs} />
        </Field>
      ) : <p className="text-xs text-[var(--app-ink-3)]">This role sees every division, read-only.</p>}
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : person ? "Save changes" : "Add to team"}</Button>
      </div>
    </form>
  );
}

export default function TeamPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: () => api<{ users: Person[] }>("/api/team") });
  const { data: dv } = useQuery({ queryKey: ["divisions"], queryFn: () => api<{ divisions: Division[] }>("/api/divisions") });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const divisions = dv?.divisions ?? [];
  const users = data?.users ?? [];
  const active = users.filter((u) => u.active);
  const unmapped = active.filter((u) => (u.role === "MARKETING" || u.role === "SALES") && u.divisions.length === 0);

  async function toggle(p: Person) {
    await api(`/api/team/${p.id}`, { method: "PATCH", json: { active: !p.active } });
    await qc.invalidateQueries({ queryKey: ["team"] });
  }

  return (
    <>
      <PageHeader title="Team" description="Add people and map each one to the divisions they work in.">
        <Button onClick={() => { setAdding(true); setEditing(null); }}><Plus className="h-4 w-4" /> Add team member</Button>
      </PageHeader>

      {unmapped.length > 0 ? (
        <NextStep title={`${unmapped.length} ${unmapped.length === 1 ? "person isn't" : "people aren't"} mapped to a division`} description={`${unmapped.map((u) => u.name).join(", ")} can't log or see enquiries until you map them.`} actionLabel="Map now" onAction={() => setEditing(unmapped[0].id)} />
      ) : null}

      <Panel>
        <PanelHeader title={`${active.length} active`} caption="Marketing logs enquiries. Sales adds pricing and feedback." />
        {adding ? <PersonForm divisions={divisions} onDone={() => setAdding(false)} /> : null}
        {isLoading ? <PanelSkeleton className="m-4 h-48" /> : users.length === 0 ? (
          <EmptyState icon={UserPlus} title="Add your first team member" description="Start with a Marketing person, then a Sales person." />
        ) : (
          <ul>
            {users.map((p) => (
              <li key={p.id} className="border-t border-[var(--app-line-soft)] first:border-0">
                {editing === p.id ? <PersonForm person={p} divisions={divisions} onDone={() => setEditing(null)} /> : (
                  <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4", !p.active && "opacity-55")}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-brand-tint)] text-xs font-bold text-[var(--app-brand)]">{p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-[10rem] flex-1">
                      <p className="text-sm font-bold text-[var(--app-ink)]">{p.name} <span className="ml-1 rounded-full bg-[var(--app-surface-sunk)] px-2 py-0.5 text-[10px] font-bold text-[var(--app-ink-2)]">{roleLabel(p.role as never)}</span></p>
                      <p className="text-xs text-[var(--app-ink-3)]">{p.email}{p.phone ? ` · ${p.phone}` : ""}</p>
                    </div>
                    <div className="flex min-w-[8rem] flex-1 flex-wrap gap-1.5">
                      {(p.role === "MARKETING" || p.role === "SALES") ? (p.divisions.length ? p.divisions.map((d) => <span key={d.id} className="rounded-full bg-[var(--app-brand-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--app-brand)]">{d.name}</span>) : <span className="text-xs font-semibold text-[var(--app-act-ink)]">No division yet</span>) : p.role === "SUPER_ADMIN" ? null : <span className="text-xs text-[var(--app-ink-3)]">All divisions, read-only</span>}
                    </div>
                    {p.role !== "SUPER_ADMIN" ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(p.id); setAdding(false); }}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => void toggle(p)}>{p.active ? <><X className="h-3.5 w-3.5" />Deactivate</> : "Activate"}</Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
