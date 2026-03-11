"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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

async function fetchDivisions() {
  const res = await fetch("/api/divisions", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch divisions");
  const data = await res.json();
  return data.divisions as { id: number; name: string }[];
}

export default function NewOrderPage() {
  const router = useRouter();
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: divisions = [] } = useQuery({
    queryKey: ["divisions"],
    queryFn: fetchDivisions,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!divisionId) {
      setError("Please select a division.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ divisionId, description: description || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create order");
        return;
      }
      router.push(`/orders/${data.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">←</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">New order</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Create order</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 text-sm p-3">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label>Division</Label>
              <Select value={divisionId?.toString() ?? ""} onValueChange={(v) => setDivisionId(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select division" />
                </SelectTrigger>
                <SelectContent>
                  {divisions.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Order details..."
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create order"}</Button>
              <Button type="button" variant="outline" asChild><Link href="/orders">Cancel</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
