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
import { UserPlus, X, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

type Division = {
  id: number;
  name: string;
  active?: boolean;
  managers: { user: { id: number; name: string; email: string; active?: boolean } }[];
};
type UserItem = {
  id: number;
  name: string;
  email: string;
  role: string;
  active?: boolean;
  divisionId?: number | null;
  division?: { id: number; name: string } | null;
};

async function safeReadJson(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractErrorMessage(
  data: Record<string, unknown>,
  fallback: string
): string {
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

async function fetchDivisions(): Promise<{ divisions: Division[] }> {
  const res = await fetch("/api/divisions?includeInactive=true", { credentials: "include" });
  const data = await safeReadJson(res);
  if (!res.ok) throw new Error(extractErrorMessage(data, "Failed to fetch divisions"));
  return data as { divisions: Division[] };
}

async function fetchUsers(): Promise<{ users: UserItem[] }> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  const data = await safeReadJson(res);
  if (!res.ok) throw new Error(extractErrorMessage(data, "Failed to fetch users"));
  return data as { users: UserItem[] };
}

export default function AdminDivisionsPage() {
  const { user } = useAuth();
  const isViewOnly = user?.role === "MANAGING_DIRECTOR";
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [assignDivisionId, setAssignDivisionId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [editDivision, setEditDivision] = useState<Division | null>(null);
  const [editDivisionName, setEditDivisionName] = useState("");
  const [editDivisionActive, setEditDivisionActive] = useState(true);
  const [divisionToDelete, setDivisionToDelete] = useState<Division | null>(null);
  const [deleteError, setDeleteError] = useState("");

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
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(extractErrorMessage(data, "Failed to create"));
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
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(extractErrorMessage(data, "Failed to assign"));
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
        const data = await safeReadJson(res);
        throw new Error(extractErrorMessage(data, "Failed to remove"));
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["divisions"] }),
  });

  const updateDivisionMutation = useMutation({
    mutationFn: async ({ id, name, active }: { id: number; name: string; active: boolean }) => {
      const res = await fetch(`/api/divisions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, active }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(extractErrorMessage(data, "Failed to update"));
      return data;
    },
    onSuccess: () => {
      setEditDivision(null);
      queryClient.invalidateQueries({ queryKey: ["divisions"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteDivisionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/divisions/${id}`, { method: "DELETE", credentials: "include" });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(extractErrorMessage(data, "Failed to delete"));
    },
    onSuccess: () => {
      setDivisionToDelete(null);
      setDeleteError("");
      queryClient.invalidateQueries({ queryKey: ["divisions"] });
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
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

      {!isViewOnly && (
      <Card>
        <CardHeader>
          <CardTitle>Add division</CardTitle>
          <p className="text-sm text-slate-500">Only Super Admin can add new divisions.</p>
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
      )}

      <Card>
        <CardHeader>
          <CardTitle>Divisions & Division Heads</CardTitle>
          <p className="text-sm text-slate-500">
            Assign users as Division Heads to a division. Only Super Admin can assign or remove.
          </p>
          <p className="text-sm text-slate-500">
            Status: <strong>Active</strong> divisions appear in lists and dropdowns; use <strong>Edit</strong> to set a division to Active or Inactive.
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
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{d.name}</span>
                      <Badge variant={d.active !== false ? "success" : "secondary"}>
                        {d.active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {!isViewOnly && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditDivision(d);
                          setEditDivisionName(d.name);
                          setEditDivisionActive(d.active !== false);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDivisionToDelete(d)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
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
                    )}
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
                          {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              removeMutation.mutate({ divisionId: d.id, userId: m.user.id })
                            }
                            className="text-slate-400 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          )}
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

      {!isViewOnly && (
      <>
      <Dialog
        open={!!divisionToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setDivisionToDelete(null);
            setDeleteError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete division permanently?</DialogTitle>
          </DialogHeader>
          {divisionToDelete && (
            <>
              <p className="text-slate-600">
                <strong>{divisionToDelete.name}</strong> will be removed completely from the database. This cannot be undone.
              </p>
              <p className="text-sm text-slate-500">
                If this division has enquiries or is in use, delete will be blocked. Use <strong>Edit</strong> to set status to Inactive instead.
              </p>
            </>
          )}
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDivisionToDelete(null); setDeleteError(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => divisionToDelete && deleteDivisionMutation.mutate(divisionToDelete.id)}
              disabled={deleteDivisionMutation.isPending}
            >
              {deleteDivisionMutation.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    .filter((u) => u.active !== false)
                    .filter((u) => {
                      if (!assignDivisionId) return true;
                      const div = divisions.find((x) => x.id === assignDivisionId);
                      return !div || !divisionAlreadyHasUser(div, u.id);
                    })
                    .map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name} ({u.email}) — {u.role}
                        {" — "}
                        {u.division?.name ? `Division: ${u.division.name}` : "No division"}
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
      </>
      )}

      {!isViewOnly && (
      <Dialog open={!!editDivision} onOpenChange={(o) => !o && setEditDivision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit division</DialogTitle>
          </DialogHeader>
          {editDivision && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editDivisionName}
                  onChange={(e) => setEditDivisionName(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editDivisionActive}
                  onChange={(e) => setEditDivisionActive(e.target.checked)}
                />
                <span>Active (show in lists)</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDivision(null)}>Cancel</Button>
            <Button
              onClick={() =>
                editDivision &&
                updateDivisionMutation.mutate({
                  id: editDivision.id,
                  name: editDivisionName.trim(),
                  active: editDivisionActive,
                })
              }
              disabled={!editDivisionName.trim() || updateDivisionMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
