"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

type Division = {
  id: number;
  name: string;
  managers?: { user: { name: string; email: string } }[];
};

async function fetchDivisions(): Promise<{ divisions: Division[] }> {
  const res = await fetch("/api/divisions", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch divisions");
  return res.json();
}

export default function DivisionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newDivisionName, setNewDivisionName] = useState("");
  const [addError, setAddError] = useState("");
  const [multiReason, setMultiReason] = useState("");
  const [multiDivisionIds, setMultiDivisionIds] = useState<number[]>([]);
  const [multiError, setMultiError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["divisions"],
    queryFn: fetchDivisions,
  });
  const divisions = data?.divisions ?? [];

  const canAddDivision = user && ["SUPER_ADMIN", "MANAGER"].includes(user.role);
  const canRequestMulti = user && user.role === "MANAGER";

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create division");
      return data;
    },
    onSuccess: () => {
      setNewDivisionName("");
      setAddError("");
      queryClient.invalidateQueries({ queryKey: ["divisions"] });
    },
    onError: (err: Error) => setAddError(err.message),
  });

  const multiRequestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/multi-division-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: multiReason.trim(), divisionIds: multiDivisionIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");
      return data;
    },
    onSuccess: () => {
      setMultiReason("");
      setMultiDivisionIds([]);
      setMultiError("");
      queryClient.invalidateQueries({ queryKey: ["divisions"] });
    },
    onError: (err: Error) => setMultiError(err.message),
  });

  function toggleDivision(id: number) {
    setMultiDivisionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Divisions</h1>

      {canAddDivision && (
        <Card>
          <CardHeader>
            <CardTitle>Add division</CardTitle>
            <p className="text-sm text-slate-500">
              Create a new division (e.g. Lamination, Dyeing, Processing, Garment, Finishing).
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newDivisionName.trim();
                if (!trimmed) {
                  setAddError("Name is required");
                  return;
                }
                createMutation.mutate(trimmed);
              }}
              className="flex gap-4 items-end max-w-md"
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="new-division">Division name</Label>
                <Input
                  id="new-division"
                  value={newDivisionName}
                  onChange={(e) => setNewDivisionName(e.target.value)}
                  placeholder="e.g. Lamination"
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding…" : "Add division"}
              </Button>
            </form>
            {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
          </CardContent>
        </Card>
      )}

      {canRequestMulti && divisions.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Request multi-division access</CardTitle>
            <p className="text-sm text-slate-500">
              Request access to additional divisions. Super Admin will approve or reject.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Requested divisions</Label>
              <div className="flex flex-wrap gap-2">
                {divisions.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={multiDivisionIds.includes(d.id)}
                      onChange={() => toggleDivision(d.id)}
                    />
                    <span>{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="multi-reason">Reason for access (min 10 characters)</Label>
              <Input
                id="multi-reason"
                value={multiReason}
                onChange={(e) => setMultiReason(e.target.value)}
                placeholder="e.g. Product development requires coordination between both divisions."
              />
            </div>
            <Button
              onClick={() => multiRequestMutation.mutate()}
              disabled={
                multiDivisionIds.length === 0 ||
                multiReason.trim().length < 10 ||
                multiRequestMutation.isPending
              }
            >
              {multiRequestMutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
            {multiError && <p className="text-sm text-red-600">{multiError}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All divisions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : !divisions.length ? (
            <div className="py-8 text-center text-slate-500">No divisions.</div>
          ) : (
            <ul className="space-y-4">
              {divisions.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-4"
                >
                  <span className="font-medium">{d.name}</span>
                  {d.managers?.length ? (
                    <span className="text-sm text-slate-500">
                      Division Heads: {d.managers.map((m) => m.user.name).join(", ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
