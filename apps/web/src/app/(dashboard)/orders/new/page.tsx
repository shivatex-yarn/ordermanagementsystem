"use client";

import { useState, useEffect, useRef } from "react";
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
import { Plus, X, Upload, FileText, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { userMayCreateEnquiry } from "@/lib/enquiry-access";

async function fetchDivisionsForRouting() {
  const res = await fetch("/api/divisions?scope=routing", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch divisions");
  const data = await res.json();
  if (Array.isArray(data)) return data as { id: number; name: string }[];
  if (Array.isArray(data?.divisions)) return data.divisions as { id: number; name: string }[];
  return [];
}

type CustomField = { title: string; value: string };

export default function NewOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core fields
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [sampleRequested, setSampleRequested] = useState(false);
  const [sampleRequestNotes, setSampleRequestNotes] = useState("");

  // Mandatory customer identity fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [gstCopyUrl, setGstCopyUrl] = useState("");
  const [gstFileName, setGstFileName] = useState("");
  const [customerOrderDate, setCustomerOrderDate] = useState("");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: divisions = [], isSuccess: divisionsLoaded } = useQuery({
    queryKey: ["order-form-divisions", "routing"],
    queryFn: fetchDivisionsForRouting,
    enabled: typeof window !== "undefined",
  });

  useEffect(() => {
    if (!divisionsLoaded || divisions.length !== 1) return;
    setDivisionId((prev) => (prev == null ? divisions[0].id : prev));
  }, [divisionsLoaded, divisions]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!userMayCreateEnquiry(user.role)) {
      router.replace("/orders");
    }
  }, [authLoading, user, router]);

  const routableDivisionId = divisions.length === 1 ? (divisions[0]?.id ?? null) : divisionId;

  async function handleGstUpload(file: File) {
    setUploadError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/gst", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setGstCopyUrl(data.url);
      setGstFileName(file.name);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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
    if (routableDivisionId == null) { setError("Please select a division."); return; }
    if (!companyName.trim()) { setError("Company name is required."); return; }
    if (!description.trim()) { setError("Product description is required."); return; }
    if (!customerName.trim()) { setError("Customer name is required."); return; }
    if (!customerPhone.trim()) { setError("Customer phone number is required."); return; }
    if (!gstNumber.trim()) { setError("GST number is required."); return; }
    if (!gstCopyUrl) { setError("Please upload the GST certificate."); return; }
    if (!customerOrderDate) { setError("Customer order date is required."); return; }
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
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          gstNumber: gstNumber.trim(),
          gstCopyUrl,
          customerOrderDate,
          customFields: Object.keys(customFieldsObj).length ? customFieldsObj : undefined,
          sampleRequested,
          ...(sampleRequested && sampleRequestNotes.trim()
            ? { sampleRequestNotes: sampleRequestNotes.trim() }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create enquiry"); return; }
      const newId = typeof data.id === "number" ? data.id : Number(data.id);
      if (Number.isInteger(newId)) {
        try {
          const detailRes = await fetch(`/api/orders/${newId}`, { credentials: "include" });
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as Record<string, unknown>;
            queryClient.setQueryData(["order", newId], detail);
          }
        } catch { /* detail page will refetch */ }
      }
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push(`/orders/${data.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="text-slate-500 text-sm">{authLoading ? "Loading…" : "Please sign in."}</div>
      </div>
    );
  }
  if (!userMayCreateEnquiry(user.role)) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="text-slate-500 text-sm">Redirecting to enquiries…</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">←</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New enquiry</h1>
          <p className="text-sm text-slate-500">All fields marked required must be filled.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-3">
            {error}
          </div>
        )}

        {/* ── Customer Identity ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Customer details</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Required customer information attached to this enquiry.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer name <span className="text-red-500">*</span></Label>
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone number <span className="text-red-500">*</span></Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gstNumber">GST number <span className="text-red-500">*</span></Label>
                <Input
                  id="gstNumber"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  maxLength={15}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerOrderDate">Customer order date <span className="text-red-500">*</span></Label>
                <input
                  id="customerOrderDate"
                  type="date"
                  value={customerOrderDate}
                  onChange={(e) => setCustomerOrderDate(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30 focus-visible:border-slate-400"
                />
              </div>
            </div>

            {/* GST Certificate Upload */}
            <div className="space-y-2">
              <Label>GST certificate <span className="text-red-500">*</span></Label>
              {gstCopyUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-emerald-800">{gstFileName || "GST certificate uploaded"}</p>
                    <a href={gstCopyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 underline">
                      View uploaded file
                    </a>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-slate-500 hover:text-red-600"
                    onClick={() => { setGstCopyUrl(""); setGstFileName(""); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-6 text-center hover:border-slate-400 hover:bg-slate-100 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) void handleGstUpload(file);
                  }}
                >
                  <Upload className="h-6 w-6 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {uploading ? "Uploading…" : "Click to upload or drag & drop"}
                    </p>
                    <p className="text-xs text-slate-400">PDF, PNG, JPG up to 5 MB</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleGstUpload(file);
                    }}
                  />
                </div>
              )}
              {uploadError && (
                <p className="text-xs text-red-600">{uploadError}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Product & Company ── */}
        <Card>
          <CardHeader>
            <CardTitle>Product &amp; company</CardTitle>
            <p className="text-sm text-slate-500 font-normal">Core enquiry details shown on the record.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name <span className="text-red-500">*</span></Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. ABC Textiles Pvt. Ltd."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Product description <span className="text-red-500">*</span></Label>
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

        {/* ── Routing, Sample & Extra ── */}
        <Card>
          <CardHeader>
            <CardTitle>Routing, sample &amp; extra fields</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Division routing and optional sample / custom fields.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Division <span className="text-red-500">*</span></Label>
              {!divisionsLoaded ? (
                <div className="h-10 rounded-lg border-2 border-slate-200 bg-slate-50 animate-pulse" aria-busy />
              ) : divisions.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  You are not assigned to any division. Ask an administrator before creating an enquiry.
                </div>
              ) : divisions.length === 1 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900">
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
                    Division Head can add specifications and approve when the sample ships.
                  </p>
                </div>
              </div>
              {sampleRequested && (
                <div className="space-y-2 pl-7">
                  <Label htmlFor="sampleNotes">Sample notes (optional)</Label>
                  <textarea
                    id="sampleNotes"
                    value={sampleRequestNotes}
                    onChange={(e) => setSampleRequestNotes(e.target.value)}
                    placeholder="e.g. Need 2m swatch, navy blue, deadline Friday"
                    rows={3}
                    className="flex min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Custom fields <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                <Button type="button" variant="outline" size="sm" onClick={addCustomField}>
                  <Plus className="h-4 w-4 mr-1" /> Add field
                </Button>
              </div>
              {customFields.map((f, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input placeholder="Field title" value={f.title} onChange={(e) => updateCustomField(i, "title", e.target.value)} className="flex-1" />
                  <Input placeholder="Value" value={f.value} onChange={(e) => updateCustomField(i, "value", e.target.value)} className="flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeCustomField(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                disabled={loading || uploading || divisions.length === 0 || routableDivisionId == null}
              >
                {loading ? "Creating…" : "Create enquiry"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/orders">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
