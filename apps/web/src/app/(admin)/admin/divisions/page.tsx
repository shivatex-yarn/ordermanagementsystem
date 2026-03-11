"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function fetchDivisions() {
  const res = await fetch("/api/divisions", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch divisions");
  const data = await res.json();
  return data.divisions as { id: number; name: string }[];
}

export default function AdminDivisionsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const { data: divisions = [], isLoading } = useQuery({
    queryKey: ["divisions"],
    queryFn: fetchDivisions,
  });

  const createMutation = useMutation({
    mutationFn: async (divisionName: string) => {
      const res = await fetch("/api/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: divisionName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      return data;
    },
    onSuccess: () => {
      setName("");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["divisions"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    createMutation.mutate(trimmed);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin — Divisions</h1>
        <p className="text-slate-500 mt-1">
          Add and manage divisions. Only Super Admin can access this page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add division</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-4 items-end max-w-md">
            <div className="flex-1 space-y-2">
              <Label htmlFor="division-name">Division name</Label>
              <Input
                id="division-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Operations"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add division"}
            </Button>
          </form>
          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing divisions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-500">Loading...</p>
          ) : !divisions.length ? (
            <p className="text-slate-500">No divisions yet. Add one above.</p>
          ) : (
            <ul className="space-y-2">
              {divisions.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3"
                >
                  <span className="font-medium text-slate-900">{d.name}</span>
                  <span className="text-xs text-slate-500">ID: {d.id}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
