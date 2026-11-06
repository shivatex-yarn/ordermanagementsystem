"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Paperclip } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, todayInput } from "@/lib/format";
import { Panel, PanelHeader, PageHeader } from "@/components/ui/panel";
import { Callout } from "@/components/ui/guidance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FormError, Segmented, textareaClass } from "@/components/ui/field";
import { canCreateEnquiry } from "@/lib/roles";
import { cn } from "@/lib/utils";

export default function NewEnquiryPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [f, setF] = useState({
    enquiryDate: todayInput(), customerName: "", companyName: "", customerPhone: "", customerEmail: "",
    customerAddress: "", gstNumber: "", productDetails: "",
  });
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [gst, setGst] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  if (user && !canCreateEnquiry(user.role)) {
    return <Callout tone="info" title="Only Marketing logs enquiries">Open an enquiry from the list to add pricing or feedback.</Callout>;
  }
  const divisions = user?.divisions ?? [];

  async function upload(file: File) {
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      setGst(await api<{ url: string; name: string }>("/api/uploads/gst", { method: "POST", body }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!divisionId) return setError("Pick a division");
    setBusy(true);
    try {
      const order = await api<{ id: number }>("/api/orders", {
        method: "POST",
        json: { ...f, divisionId, isSample, gstCopyUrl: gst?.url },
      });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--app-ink-3)] hover:text-[var(--app-ink)]"><ArrowLeft className="h-4 w-4" /> Enquiries</Link>
      <PageHeader title="New enquiry" description="Fill in what you know. Sales adds the pricing next." />

      {user && user.role === "MARKETING" && divisions.length === 0 ? (
        <Callout tone="wait" title="You aren't mapped to a division">
          Ask the admin to map you, or <Link href="/divisions" className="font-semibold underline">request access</Link>.
        </Callout>
      ) : null}

      <form onSubmit={submit} className="space-y-6">
        <Panel>
          <PanelHeader title="Client" caption="Who is asking?" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Enquiry date" htmlFor="d"><Input id="d" type="date" required value={f.enquiryDate} onChange={set("enquiryDate")} /></Field>
            <Field label="Contact person" htmlFor="cn"><Input id="cn" required value={f.customerName} onChange={set("customerName")} placeholder="Lakshmi Narayan" /></Field>
            <Field label="Company" optional htmlFor="co"><Input id="co" value={f.companyName} onChange={set("companyName")} placeholder="Lakshmi Textiles" /></Field>
            <Field label="Phone" optional htmlFor="ph"><Input id="ph" inputMode="tel" value={f.customerPhone} onChange={set("customerPhone")} placeholder="98450 11223" /></Field>
            <Field label="Email" optional htmlFor="em"><Input id="em" type="email" value={f.customerEmail} onChange={set("customerEmail")} placeholder="buyer@company.in" /></Field>
            <Field label="GST number" optional htmlFor="gs"><Input id="gs" value={f.gstNumber} onChange={set("gstNumber")} placeholder="29ABCDE1234F1Z5" /></Field>
            <Field label="GST certificate" optional hint="PDF, JPG or PNG, up to 5 MB." className="sm:col-span-2">
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--app-line)] bg-[var(--app-surface-sunk)] px-3.5 text-sm text-[var(--app-ink-2)] hover:border-[var(--app-brand-line)]">
                <Paperclip className="h-4 w-4 text-[var(--app-ink-3)]" aria-hidden />
                <span className="truncate">{gst ? gst.name : "Choose a file"}</span>
                <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
              </label>
            </Field>
            <Field label="Address" optional className="sm:col-span-2" htmlFor="ad"><textarea id="ad" className={textareaClass} style={{ minHeight: 64 }} value={f.customerAddress} onChange={set("customerAddress")} /></Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="What they need" caption="Works for every division." />
          <div className="space-y-5 p-5">
            <Field label="Division">
              <div className="flex flex-wrap gap-2">
                {divisions.map((d) => (
                  <button key={d.id} type="button" aria-pressed={divisionId === d.id} onClick={() => setDivisionId(d.id)}
                    className={cn("rounded-full border px-4 py-2 text-sm font-semibold transition-colors", divisionId === d.id ? "border-[var(--app-brand)] bg-[var(--app-brand)] text-white" : "border-[var(--app-line)] bg-white text-[var(--app-ink-2)] hover:border-[var(--app-brand-line)]")}>
                    {d.name}
                  </button>
                ))}
                {divisions.length === 0 ? <span className="text-sm text-[var(--app-ink-3)]">No divisions available</span> : null}
              </div>
            </Field>
            <Field label="Product / requirement details" htmlFor="pd" hint="Describe the product, specification and quantity the client wants.">
              <textarea id="pd" required className={textareaClass} value={f.productDetails} onChange={set("productDetails")} placeholder="e.g. Laminated fabric, 120 gsm, 5,000 metres, navy blue" />
            </Field>
            <Field label="Is this a sample?" hint="Choose Yes if the client wants a sample before ordering.">
              <Segmented value={isSample} onChange={setIsSample} options={[{ value: true, label: "Yes, sample" }, { value: false, label: "No, full order" }]} />
            </Field>
          </div>
        </Panel>

        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push("/orders")}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create enquiry and send to Sales"}</Button>
        </div>
      </form>
    </>
  );
}
