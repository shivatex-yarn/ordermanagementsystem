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

  const { data: divisions = [], isSuccess: divisionsLoaded } = useQuery({
    queryKey: ["order-form-divisions", "routing"],
    queryFn: fetchDivisionsForRouting,
  });

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
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!description.trim()) {
      setError("Product description is required.");
      return;
    }
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create enquiry");
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
        <Card>
          <CardHeader>
            <CardTitle>Customer &amp; product</CardTitle>
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
