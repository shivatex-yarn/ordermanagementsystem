"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, X } from "lucide-react";

type Division = {
  id: number;
  name: string;
  managers: { user: { id: number; name: string; email: string } }[];
};
type UserItem = { id: number; name: string; email: string; role: string };

async function fetchDivisions(): Promise<{ divisions: Division[] }> {
  const res = await fetch("/api/divisions", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch divisions");
  return res.json();
}

async function fetchUsers(): Promise<{ users: UserItem[] }> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export default function AdminDivisionsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [assignDivisionId, setAssignDivisionId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<string>("");

  const { data: divisionsData, isLoading } = useQuery({
    queryKey: ["divisions"],
    queryFn: fetchDivisions,
  });
  const { data: usersData } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
  });
  const divisions = divisionsData?.divisions ?? [];
  const users = usersData?.users ?? [];

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

  const assignMutation = useMutation({
    mutationFn: async ({ divisionId, userId }: { divisionId: number; userId: number }) => {
      const res = await fetch(`/api/divisions/${divisionId}/managers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      return data;
    },
    onSuccess: () => {
      setAssignDivisionId(null);
      setAssignUserId("");
      queryClient.invalidateQueries({ queryKey: ["divisions"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async ({ divisionId, userId }: { divisionId: number; userId: number }) => {
      const res = await fetch(`/api/divisions/${divisionId}/managers?userId=${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["divisions"] }),
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

  function handleAssign() {
    if (!assignDivisionId || !assignUserId) return;
    assignMutation.mutate({ divisionId: assignDivisionId, userId: Number(assignUserId) });
  }

  const divisionAlreadyHasUser = (d: Division, uid: number) =>
    d.managers.some((m) => m.user.id === uid);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Divisions</h1>
        <p className="text-slate-500 mt-1">
          Add divisions and assign Division Heads. Super Admin can map users to divisions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add division</CardTitle>
          <p className="text-sm text-slate-500">
            Super Admin and Division Heads (Managers) can add new divisions.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-4 items-end max-w-md">
            <div className="flex-1 space-y-2">
              <Label htmlFor="division-name">Division name</Label>
              <Input
                id="division-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lamination, Dyeing, Processing"
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
          <CardTitle>Divisions & Division Heads</CardTitle>
          <p className="text-sm text-slate-500">
            Assign users as Division Heads to a division. Only Super Admin can assign or remove.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-500">Loading...</p>
          ) : !divisions.length ? (
            <p className="text-slate-500">No divisions yet. Add one above.</p>
          ) : (
            <ul className="space-y-4">
              {divisions.map((d) => (
                <li
                  key={d.id}
                  className="rounded-lg border border-slate-100 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{d.name}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAssignDivisionId(d.id);
                        setAssignUserId("");
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Assign Division Head
                    </Button>
                  </div>
                  {d.managers?.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {d.managers.map((m) => (
                        <li
                          key={m.user.id}
                          className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm"
                        >
                          <span>{m.user.name}</span>
                          <span className="text-slate-500">({m.user.email})</span>
                          <button
                            type="button"
                            onClick={() =>
                              removeMutation.mutate({ divisionId: d.id, userId: m.user.id })
                            }
                            className="text-slate-400 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No Division Head assigned.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={assignDivisionId !== null} onOpenChange={(open) => !open && setAssignDivisionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Division Head</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => {
                      if (!assignDivisionId) return true;
                      const div = divisions.find((x) => x.id === assignDivisionId);
                      return !div || !divisionAlreadyHasUser(div, u.id);
                    })
                    .map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name} ({u.email}) — {u.role}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDivisionId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!assignUserId || assignMutation.isPending}
            >
              {assignMutation.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
