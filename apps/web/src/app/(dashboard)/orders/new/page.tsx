"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";

async function fetchDivisionsForRouting() {
  const res = await fetch("/api/divisions?scope=routing", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch divisions");
  const data = await res.json();
  if (Array.isArray(data)) return data as { id: number; name: string }[];
  if (Array.isArray(data?.divisions)) return data.divisions as { id: number; name: string }[];
  return [];
}

type CustomField = { title: string; value: string };
type GstCert = { filename: string; mimeType: string; base64: string; size: number };

const MAX_GST_BYTES = 5 * 1024 * 1024; // 5 MB hard cap

async function fileToGstCert(file: File): Promise<GstCert> {
  if (file.size > MAX_GST_BYTES) throw new Error("GST certificate must be 5 MB or less");
  const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
  if (!allowed.includes(file.type)) throw new Error("GST certificate must be PDF / JPG / PNG");
  const ab = await file.arrayBuffer();
  // Convert to base64 in chunks to avoid stack overflow for large files.
  const bytes = new Uint8Array(ab);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { filename: file.name, mimeType: file.type, base64: btoa(binary), size: file.size };
}

export default function NewOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [sampleRequested, setSampleRequested] = useState(false);
  const [sampleRequestNotes, setSampleRequestNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ─── Mandatory customer information (Phase 2 spec) ─────────────────────────────
  const [customerId,        setCustomerId]        = useState("");
  const [customerName,      setCustomerName]      = useState("");
  const [customerPhone,     setCustomerPhone]     = useState("");
  const [customerGstNumber, setCustomerGstNumber] = useState("");
  const [customerOrderDate, setCustomerOrderDate] = useState("");
  const [gstCert,           setGstCert]           = useState<GstCert | null>(null);
  const [gstCertError,      setGstCertError]      = useState("");

  const { data: divisions = [], isSuccess: divisionsLoaded } = useQuery({
    queryKey: ["order-form-divisions", "routing"],
    queryFn: fetchDivisionsForRouting,
  });

  /**
   * Auto-generated Customer ID — `CUS-XXXX` derived from the highest existing
   * sequence. The salesperson can see it but cannot edit it.
   */
  const { data: nextIdData } = useQuery({
    queryKey: ["customer-next-id"],
    queryFn: async () => {
      const res = await fetch("/api/customers/next-id", { credentials: "include" });
      if (!res.ok) return { nextId: "" };
      return (await res.json()) as { nextId: string };
    },
    staleTime: 30_000,
  });
  useEffect(() => {
    if (nextIdData?.nextId && !customerId) setCustomerId(nextIdData.nextId);
  }, [nextIdData?.nextId, customerId]);

  useEffect(() => {
    if (!divisionsLoaded || divisions.length !== 1) return;
    setDivisionId((prev) => (prev == null ? divisions[0].id : prev));
  }, [divisionsLoaded, divisions]);

  const routableDivisionId = divisions.length === 1 ? (divisions[0]?.id ?? null) : divisionId;

  function addCustomField() {
    setCustomFields((prev) => [...prev, { title: "", value: "" }]);
  }
  function updateCustomField(i: number, field: "title" | "value", v: string) {
    setCustomFields((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v };
      return next;
    });
  }
  function removeCustomField(i: number) {
    setCustomFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (routableDivisionId == null) {
      setError("Please select a division.");
      return;
    }
    if (!companyName.trim()) return setError("Company name is required.");
    if (!description.trim()) return setError("Product description is required.");

    // Mandatory customer info — block submission until all six are provided.
    if (!customerId.trim()) return setError("Customer ID is required.");
    if (!customerName.trim()) return setError("Customer name is required.");
    if (!customerPhone.trim()) return setError("Customer phone is required.");
    if (!customerGstNumber.trim()) return setError("Customer GST number is required.");
    if (customerGstNumber.trim().length !== 15)
      return setError("GST number must be exactly 15 characters.");
    if (!customerOrderDate) return setError("Customer order date is required.");
    if (!gstCert) return setError("GST certificate upload is required.");

    setError("");
    setLoading(true);
    try {
      const customFieldsObj: Record<string, string> = {};
      customFields.forEach((f) => {
        if (f.title.trim()) customFieldsObj[f.title.trim()] = f.value.trim();
      });
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          divisionId: routableDivisionId,
          companyName: companyName.trim(),
          description: description.trim(),
          customFields: Object.keys(customFieldsObj).length ? customFieldsObj : undefined,
          sampleRequested,
          ...(sampleRequested && sampleRequestNotes.trim()
            ? { sampleRequestNotes: sampleRequestNotes.trim() }
            : {}),
          // Mandatory customer info
          customerId: customerId.trim(),
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerGstNumber: customerGstNumber.trim().toUpperCase(),
          customerGstCertificate: gstCert,
          customerOrderDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = (data as { details?: { fieldErrors?: Record<string, string[]> } })?.details;
        const fieldErrors = details?.fieldErrors ?? {};
        const firstField = Object.keys(fieldErrors)[0];
        const firstMsg = firstField ? fieldErrors[firstField]?.[0] : undefined;
        setError(firstMsg || data.error || "Failed to create enquiry");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push(`/orders/${data.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onGstFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setGstCertError("");
    const file = e.target.files?.[0];
    if (!file) {
      setGstCert(null);
      return;
    }
    try {
      const cert = await fileToGstCert(file);
      setGstCert(cert);
    } catch (err) {
      setGstCert(null);
      setGstCertError(err instanceof Error ? err.message : "Could not read file");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">←</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">New enquiry</h1>
      </div>
      <form onSubmit={onSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm p-3">
            {error}
          </div>
        )}
        <Card className="overflow-hidden border-slate-200 shadow-sm ring-1 ring-slate-900/5">
          <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 items-center rounded-full bg-slate-900 px-2 text-[10px] font-semibold uppercase tracking-wider text-white">
                Required
              </span>
              <CardTitle className="text-base">Customer information</CardTitle>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Capture customer order details before raising the enquiry. Every field below is
              mandatory; the enquiry cannot be submitted until the GST certificate is uploaded.
            </p>
          </div>
          <CardContent className="space-y-4 pt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customerId">Customer ID (auto-generated)</Label>
                <Input
                  id="customerId"
                  value={customerId || "Generating…"}
                  readOnly
                  className="font-mono bg-slate-50 text-slate-700 cursor-not-allowed"
                  aria-readonly="true"
                  tabIndex={-1}
                />
                <p className="text-xs text-slate-500">
                  Automatically assigned in the format <span className="font-mono">CUS-XXXX</span>.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer name</Label>
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone number</Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerGstNumber">GST number (15 chars)</Label>
                <Input
                  id="customerGstNumber"
                  value={customerGstNumber}
                  onChange={(e) => setCustomerGstNumber(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  className="uppercase font-mono"
                  required
                />
                <p className="text-xs text-slate-500">
                  Format: 2-digit state + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1
                  alphanumeric.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerOrderDate">Customer order date</Label>
                <Input
                  id="customerOrderDate"
                  type="date"
                  value={customerOrderDate}
                  onChange={(e) => setCustomerOrderDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gstCert">GST certificate (PDF / JPG / PNG, max 5 MB)</Label>
                <Input
                  id="gstCert"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={onGstFileChange}
                  required
                />
                {gstCert ? (
                  <p className="text-xs text-emerald-700">
                    Attached: {gstCert.filename} ({(gstCert.size / 1024).toFixed(1)} KB) — stored
                    inside the enquiry.
                  </p>
                ) : null}
                {gstCertError ? (
                  <p className="text-xs text-red-700">{gstCertError}</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enquiry &amp; product</CardTitle>
            <p className="text-sm text-slate-500 font-normal">Core enquiry details shown on the record.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name (required)</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. ABC Textiles"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Product description (required)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Waterproof laminated fabric for winter jackets"
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Routing, sample &amp; extra fields</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Your enquiry is routed to your assigned division only. Optional sample request and extra fields below.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Division (required)</Label>
              {divisionsLoaded && divisions.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  You are not assigned to any division. Ask an administrator to map you to a division before creating
                  an enquiry.
                </div>
              ) : divisions.length === 1 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900">
                  {divisions[0].name}
                  <span className="ml-2 font-normal text-slate-500">(your division)</span>
                </div>
              ) : (
                <Select value={divisionId?.toString() ?? ""} onValueChange={(v) => setDivisionId(Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select division" />
                  </SelectTrigger>
                  <SelectContent>
                    {divisions.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">Sample request</p>
              <div className="flex items-start gap-3">
                <input
                  id="sampleRequested"
                  type="checkbox"
                  checked={sampleRequested}
                  onChange={(e) => setSampleRequested(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <div className="space-y-1">
                  <Label htmlFor="sampleRequested" className="font-medium cursor-pointer">
                    Customer is requesting a sample
                  </Label>
                  <p className="text-xs text-slate-500">
                    Division Head can add specifications, approve, and enter courier + tracking when the sample ships.
                  </p>
                </div>
              </div>
              {sampleRequested && (
                <div className="space-y-2 pl-7">
                  <Label htmlFor="sampleNotes">Sample request notes (optional)</Label>
                  <textarea
                    id="sampleNotes"
                    value={sampleRequestNotes}
                    onChange={(e) => setSampleRequestNotes(e.target.value)}
                    placeholder="e.g. Need 2m swatch, navy blue, deadline Friday"
                    rows={3}
                    className="flex min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Custom fields (optional)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCustomField}>
                  <Plus className="h-4 w-4 mr-1" /> Add field
                </Button>
              </div>
              {customFields.map((f, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    placeholder="Field title"
                    value={f.title}
                    onChange={(e) => updateCustomField(i, "title", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Value"
                    value={f.value}
                    onChange={(e) => updateCustomField(i, "value", e.target.value)}
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeCustomField(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading || divisions.length === 0 || routableDivisionId == null}>
                {loading ? "Creating..." : "Create enquiry"}
              </Button>
              <Button type="button" variant="outline" asChild><Link href="/orders">Cancel</Link></Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
