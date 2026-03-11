"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function fetchDivisions() {
  const res = await fetch("/api/divisions", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch divisions");
  return res.json();
}

export default function DivisionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["divisions"],
    queryFn: fetchDivisions,
  });

  const divisions = data?.divisions ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Divisions</h1>
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
              {divisions.map((d: { id: number; name: string; managers?: { user: { name: string; email: string } }[] }) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
                  <span className="font-medium">{d.name}</span>
                  {d.managers?.length ? (
                    <span className="text-sm text-slate-500">
                      Managers: {d.managers.map((m) => m.user.name).join(", ")}
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
