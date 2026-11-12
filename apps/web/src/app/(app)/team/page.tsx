"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, Upload, UserPlus, X } from "lucide-react";
import { api } from "@/lib/format";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/roles";
import { PageHeader, Panel, PanelHeader, PanelSkeleton, EmptyState } from "@/components/ui/panel";
import { NextStep } from "@/components/ui/guidance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FormError, selectClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Person = { id: number; name: string; email: string; employeeCode: string | null; phone: string | null; role: string; active: boolean; divisions: { id: number; name: string }[] };
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
  const [f, setF] = useState({ name: person?.name ?? "", employeeCode: person?.employeeCode ?? "", email: person?.email ?? "", phone: person?.phone ?? "", password: "", role: person?.role ?? "MARKETING" });
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
        await api(`/api/team/${person.id}`, { method: "PATCH", json: { name: f.name, employeeCode: f.employeeCode.trim() || null, email: f.email, phone: f.phone || null, role: f.role, ...(f.password ? { password: f.password } : {}), divisionIds: needsDivisions ? divs : [] } });
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
        <Field label="Employee code" optional hint="Your company ID for this person, e.g. ST-014. Must be unique."><Input value={f.employeeCode} onChange={set("employeeCode")} maxLength={40} placeholder="ST-014" /></Field>
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

/** Minimal CSV parser: quoted fields, commas inside quotes, CRLF, BOM. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const BULK_HEADERS = ["Employee code", "Full name", "Email", "Phone", "Role", "Password", "Divisions"];
const HEADER_KEYS = ["employeeCode", "name", "email", "phone", "role", "password", "divisions"] as const;

function downloadTemplate(divisions: Division[]) {
  const names = divisions.filter((d) => d.active).map((d) => d.name);
  const lines = [
    BULK_HEADERS,
    ["ST-014", "Priya Sharma", "priya@example.com", "98450 11223", "Marketing", "ChangeMe123", names.slice(0, 2).join("; ") || "Lamination"],
    ["ST-015", "Rahul Verma", "rahul@example.com", "", "Accounts", "ChangeMe456", ""],
  ];
  const csv = lines.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = "team-bulk-upload-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

type BulkRow = Record<(typeof HEADER_KEYS)[number], string>;

function BulkUpload({ divisions, onDone }: { divisions: Division[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: { row: number; name: string; error?: string }[] } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null); setResult(null); setRows(null);
    if (!/\.csv$/i.test(file.name)) { setError("Please upload the CSV template. In Excel, choose Save As, then CSV."); return; }
    const table = parseCsv(await file.text());
    const head = (table[0] ?? []).map((h) => h.trim().toLowerCase());
    const idx = BULK_HEADERS.map((h) => head.indexOf(h.toLowerCase()));
    const missing = BULK_HEADERS.filter((_, i) => idx[i] < 0 && i !== 0 && i !== 3 && i !== 6);
    if (missing.length) { setError(`This doesn't look like the template. Missing column: ${missing.join(", ")}.`); return; }
    const body = table.slice(1).map((r) => Object.fromEntries(HEADER_KEYS.map((k, i) => [k, idx[i] < 0 ? "" : (r[idx[i]] ?? "").trim()])) as BulkRow);
    if (body.length === 0) { setError("The file has no people in it. Fill in the template and try again."); return; }
    setFileName(file.name);
    setRows(body);
  }

  async function upload() {
    if (!rows) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ created: number; failed: { row: number; name: string; error?: string }[] }>("/api/team/bulk", { method: "POST", json: { rows } });
      setResult(r);
      setRows(null);
      await qc.invalidateQueries({ queryKey: ["team"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-b border-[var(--app-line-soft)] bg-[var(--app-surface-sunk)] p-5">
      <div>
        <p className="text-sm font-bold text-[var(--app-ink)]">Add many people at once</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-[var(--app-ink-3)]">
          <li>Download the template and fill one person per row.</li>
          <li>Role is Marketing, Sales, Managing director or Accounts. Divisions are separated by semicolons (only for Marketing and Sales).</li>
          <li>Save as CSV and upload it here.</li>
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => downloadTemplate(divisions)}><Download className="h-4 w-4" /> Download template</Button>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--app-line)] bg-white px-4 text-sm font-semibold text-[var(--app-ink)] hover:border-[var(--app-brand-line)]">
          <Upload className="h-4 w-4" /> Choose CSV file
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e)} />
        </label>
        {fileName && rows ? <span className="text-xs text-[var(--app-ink-3)]">{fileName}</span> : null}
      </div>
      {rows ? (
        <div className="rounded-xl border border-[var(--app-line)] bg-white p-4">
          <p className="text-sm font-semibold text-[var(--app-ink)]">{rows.length} {rows.length === 1 ? "person" : "people"} ready to add</p>
          <p className="mt-0.5 text-xs text-[var(--app-ink-3)]">{rows.slice(0, 3).map((r) => r.name || r.email).join(", ")}{rows.length > 3 ? ` and ${rows.length - 3} more` : ""}. Rows with a problem are skipped and listed afterwards.</p>
          <div className="mt-3"><Button type="button" onClick={() => void upload()} disabled={busy}>{busy ? "Adding…" : `Add ${rows.length} to team`}</Button></div>
        </div>
      ) : null}
      {result ? (
        <div className="rounded-xl border border-[var(--app-line)] bg-white p-4 text-sm">
          <p className="font-semibold text-[var(--app-ink)]">{result.created} added{result.failed.length ? `, ${result.failed.length} skipped` : ""}</p>
          {result.failed.length ? (
            <>
              <p className="mt-1 text-xs text-[var(--app-ink-3)]">Fix these rows in your file and upload only those again.</p>
              <ul className="mt-2 space-y-1 text-xs text-[var(--app-late-ink)]">
                {result.failed.map((f) => <li key={f.row}>Row {f.row} ({f.name}): {f.error}</li>)}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      <FormError message={error} />
      <div className="flex justify-end"><Button type="button" variant="ghost" onClick={onDone}>{result ? "Done" : "Cancel"}</Button></div>
    </div>
  );
}

export default function TeamPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: () => api<{ users: Person[] }>("/api/team") });
  const { data: dv } = useQuery({ queryKey: ["divisions"], queryFn: () => api<{ divisions: Division[] }>("/api/divisions") });
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const divisions = dv?.divisions ?? [];
  const allUsers = data?.users ?? [];
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const term = q.trim().toLowerCase();
  const users = allUsers.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter === "active" && !u.active) return false;
    if (statusFilter === "inactive" && u.active) return false;
    if (!term) return true;
    return [u.name, u.employeeCode ?? "", u.email, u.phone ?? "", roleLabel(u.role as never), ...u.divisions.map((d) => d.name)].some((v) => v.toLowerCase().includes(term));
  });
  const filtering = !!(term || roleFilter || statusFilter);
  const active = allUsers.filter((u) => u.active);
  const unmapped = active.filter((u) => (u.role === "MARKETING" || u.role === "SALES") && u.divisions.length === 0);

  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  async function remove(p: Person) {
    setRowError(null);
    try {
      await api(`/api/team/${p.id}`, { method: "DELETE" });
      setConfirmId(null);
      await qc.invalidateQueries({ queryKey: ["team"] });
      await qc.invalidateQueries({ queryKey: ["divisions"] });
    } catch (err) {
      setRowError((err as Error).message);
    }
  }
  async function toggle(p: Person) {
    await api(`/api/team/${p.id}`, { method: "PATCH", json: { active: !p.active } });
    await qc.invalidateQueries({ queryKey: ["team"] });
  }

  return (
    <>
      <PageHeader title="Team" description="Add people and map each one to the divisions they work in.">
        <Button variant="outline" onClick={() => { setBulk(true); setAdding(false); setEditing(null); }}><Upload className="h-4 w-4" /> Bulk upload</Button>
        <Button onClick={() => { setAdding(true); setBulk(false); setEditing(null); }}><Plus className="h-4 w-4" /> Add team member</Button>
      </PageHeader>

      {unmapped.length > 0 ? (
        <NextStep title={`${unmapped.length} ${unmapped.length === 1 ? "person isn't" : "people aren't"} mapped to a division`} description={`${unmapped.map((u) => u.name).join(", ")} can't log or see enquiries until you map them.`} actionLabel="Map now" onAction={() => setEditing(unmapped[0].id)} />
      ) : null}

      <Panel>
        <PanelHeader title={`${active.length} active`} caption={`${allUsers.length} people in total. Marketing logs enquiries and adds pricing and feedback.`} />
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--app-line-soft)] p-4">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-ink-3)]" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, code, email, phone, role or division" aria-label="Search team"
              className="h-10 w-full rounded-xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)] pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]/20" />
          </div>
          <select aria-label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={cn(selectClass, "w-44")}>
            <option value="">All roles</option>
            <option value="SUPER_ADMIN">Super admin</option>
            {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")} className={cn(selectClass, "w-36")}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {filtering ? <button onClick={() => { setQ(""); setRoleFilter(""); setStatusFilter(""); }} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-[var(--app-ink-3)] hover:bg-[var(--app-surface-sunk)]"><X className="h-3.5 w-3.5" />Clear</button> : null}
        </div>
        {bulk ? <BulkUpload divisions={divisions} onDone={() => setBulk(false)} /> : null}
        {adding ? <PersonForm divisions={divisions} onDone={() => setAdding(false)} /> : null}
        {rowError ? <p className="border-b border-[var(--app-line-soft)] px-5 py-3 text-sm text-[var(--app-late-ink)]">{rowError}</p> : null}
        {isLoading ? <PanelSkeleton className="m-4 h-48" /> : users.length === 0 ? (
          filtering
            ? <EmptyState icon={Search} title="No one matches" description="Try a different name, role or status, or clear the filters." />
            : <EmptyState icon={UserPlus} title="Add your first team member" description="Start with a Marketing person." />
        ) : (
          <ul>
            {users.map((p) => (
              <li key={p.id} className="border-t border-[var(--app-line-soft)] first:border-0">
                {editing === p.id ? <PersonForm person={p} divisions={divisions} onDone={() => setEditing(null)} /> : (
                  <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4", !p.active && "opacity-55")}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-brand-tint)] text-xs font-bold text-[var(--app-brand)]">{p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-[10rem] flex-1">
                      <p className="text-sm font-bold text-[var(--app-ink)]">{p.name} <span className="ml-1 rounded-full bg-[var(--app-surface-sunk)] px-2 py-0.5 text-[10px] font-bold text-[var(--app-ink-2)]">{roleLabel(p.role as never)}</span></p>
                      <p className="text-xs text-[var(--app-ink-3)]">{p.employeeCode ? <span className="font-semibold text-[var(--app-ink-2)]">{p.employeeCode} · </span> : null}{p.email}{p.phone ? ` · ${p.phone}` : ""}</p>
                    </div>
                    <div className="flex min-w-[8rem] flex-1 flex-wrap gap-1.5">
                      {(p.role === "MARKETING" || p.role === "SALES") ? (p.divisions.length ? p.divisions.map((d) => <span key={d.id} className="rounded-full bg-[var(--app-brand-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--app-brand)]">{d.name}</span>) : <span className="text-xs font-semibold text-[var(--app-act-ink)]">No division yet</span>) : p.role === "SUPER_ADMIN" ? null : <span className="text-xs text-[var(--app-ink-3)]">All divisions, read-only</span>}
                    </div>
                    {p.role !== "SUPER_ADMIN" ? (
                      confirmId === p.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--app-late-ink)]">Delete {p.name.split(" ")[0]} for good?</span>
                          <Button variant="destructive" size="sm" onClick={() => void remove(p)}>Yes, delete</Button>
                          <Button variant="ghost" size="sm" onClick={() => { setConfirmId(null); setRowError(null); }}>Keep</Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditing(p.id); setAdding(false); }}>Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => void toggle(p)}>{p.active ? <><X className="h-3.5 w-3.5" />Deactivate</> : "Activate"}</Button>
                          <Button variant="ghost" size="sm" className="text-[var(--app-late-ink)] hover:text-[var(--app-late-ink)]" onClick={() => { setConfirmId(p.id); setRowError(null); }}>Delete</Button>
                        </div>
                      )
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
