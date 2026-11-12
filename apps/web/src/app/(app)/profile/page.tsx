"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { PageHeader, Panel, PanelHeader, PanelSkeleton } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";

export default function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user) { setName(user.name); setPhone(user.phone ?? ""); setCode(user.employeeCode ?? ""); }
  }, [user]);

  if (!user) return <PanelSkeleton className="h-72" />;
  const dirty = name.trim() !== user.name || phone.trim() !== (user.phone ?? "") || code.trim() !== (user.employeeCode ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      await api("/api/profile", { method: "PATCH", json: { name, phone, employeeCode: code } });
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Your profile" description="Update how your name appears and add a phone number if you like." />
      <Panel className="max-w-2xl">
        <PanelHeader title="Details" caption={`${roleLabel(user.role)}${user.divisions.length && user.role !== "SUPER_ADMIN" ? " · " + user.divisions.map((d) => d.name).join(", ") : ""}`} />
        <form onSubmit={save} className="space-y-5 p-5">
          <Field label="Full name" htmlFor="pn"><Input id="pn" required value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></Field>
          <Field label="Phone" optional htmlFor="pp" hint="Only your admin and teammates working with you can see this."><Input id="pp" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} placeholder="98450 11223" /></Field>
          <Field label="Employee code" optional htmlFor="pc" hint="Your company ID, e.g. ST-014. Clear the box and save to remove it.">
            <Input id="pc" value={code} maxLength={40} onChange={(e) => { setCode(e.target.value); setSaved(false); }} placeholder="ST-014" />
          </Field>
          <Field label="Email" htmlFor="pe" hint="Your email is your login. It can't be changed here. Ask the admin if it's wrong.">
            <div className="relative">
              <Input id="pe" value={user.email} readOnly disabled className="pr-10" />
              <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-ink-3)]" aria-hidden />
            </div>
          </Field>
          <FormError message={error} />
          <div className="flex items-center justify-end gap-3">
            {saved ? <span role="status" className="text-sm font-semibold text-[var(--app-done-ink)]">Saved</span> : null}
            <Button type="submit" disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
