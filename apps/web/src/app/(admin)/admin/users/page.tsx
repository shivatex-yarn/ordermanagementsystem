"use client";

import { useState } from "react";
import { roleLabel } from "@/lib/roles";
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
import { UserPlus, Pencil, UserX, Trash2, KeyRound, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

type Division = { id: number; name: string; active?: boolean };
type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  active?: boolean;
  divisionId: number | null;
  division: Division | null;
  managedDivisions: Division[];
};

async function fetchAdminUsersPage(): Promise<{ users: UserRow[]; divisions: Division[] }> {
  const res = await fetch("/api/admin/users?includeDivisions=1", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const isViewOnly = user?.role === "MANAGING_DIRECTOR";
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<UserRow | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const [deactivateError, setDeactivateError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("USER");
  const [divisionId, setDivisionId] = useState<string>("");
  const [divisionIds, setDivisionIds] = useState<number[]>([]);

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editDivisionId, setEditDivisionId] = useState<string>("");
  const [editDivisionIds, setEditDivisionIds] = useState<number[]>([]);
  const [editActive, setEditActive] = useState(true);

  // Reset password dialog state
  const [resetPwUser, setResetPwUser] = useState<UserRow | null>(null);
  const [resetPwNew, setResetPwNew] = useState("");
  const [resetPwConfirm, setResetPwConfirm] = useState("");
  const [resetPwShowNew, setResetPwShowNew] = useState(false);
  const [resetPwShowConfirm, setResetPwShowConfirm] = useState(false);
  const [resetPwError, setResetPwError] = useState("");
  const [resetPwSuccess, setResetPwSuccess] = useState(false);

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchAdminUsersPage,
  });
  const users = pageData?.users ?? [];
  const divisions = (pageData?.divisions ?? []).filter((d: Division) => d.active !== false);

  const invalidateUserQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["divisions"] });
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to reset password");
      }
    },
    onSuccess: () => {
      setResetPwSuccess(true);
      setResetPwNew("");
      setResetPwConfirm("");
      setResetPwError("");
    },
    onError: (err: Error) => setResetPwError(err.message),
  });

  const deactivateUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: false }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to deactivate");
      }
    },
    onSuccess: () => {
      invalidateUserQueries();
      setEditUser(null);
      setUserToDeactivate(null);
      setDeactivateError("");
    },
    onError: (err: Error) => setDeactivateError(err.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete user");
      }
    },
    onSuccess: () => {
      invalidateUserQueries();
      setEditUser(null);
      setUserToDelete(null);
      setDeleteError("");
    },
    onError: (err: Error) => setDeleteError(err.message),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      email: string;
      password: string;
      role: string;
      divisionId?: number;
      divisionIds?: number[];
    }) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      return data;
    },
    onSuccess: () => {
      invalidateUserQueries();
      setCreateOpen(false);
      resetCreateForm();
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number;
      payload: {
        name?: string;
        email?: string;
        password?: string;
        role?: string;
        divisionId?: number | null;
        divisionIds?: number[];
      };
    }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      return data;
    },
    onSuccess: () => {
      invalidateUserQueries();
      setEditUser(null);
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  function resetCreateForm() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("USER");
    setDivisionId("");
    setDivisionIds([]);
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditPassword("");
    setEditRole(u.role);
    setEditActive(u.active !== false);
    setEditDivisionId(u.divisionId ? String(u.divisionId) : "");
    setEditDivisionIds(u.managedDivisions?.map((d) => d.id) ?? []);
  }

  function toggleEditDivision(id: number) {
    setEditDivisionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleCreateDivision(id: number) {
    setDivisionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const isManager = role === "MANAGER";
    createMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      ...(isManager && divisionIds.length
        ? { divisionIds }
        : divisionId
          ? { divisionId: Number(divisionId) }
          : {}),
    });
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setError("");
    const isManager = editRole === "MANAGER";
    const payload: {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      divisionId?: number | null;
      divisionIds?: number[];
      active?: boolean;
    } = {
      name: editName.trim(),
      email: editEmail.trim(),
      role: editRole,
      active: editActive,
    };
    if (editPassword.trim().length >= 8) payload.password = editPassword.trim();
    if (isManager) {
      payload.divisionIds = editDivisionIds;
      payload.divisionId = editDivisionIds[0] ?? null;
    } else {
      payload.divisionId = editDivisionId ? Number(editDivisionId) : null;
    }
    updateMutation.mutate({ id: editUser.id, payload });
  }

  const myUserId = user?.id;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500 mt-1">
            Create users and map them to divisions. Division Heads (Managers) can be mapped to one or more divisions.
          </p>
        </div>
        {!isViewOnly && (
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create user
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : !users.length ? (
            <div className="py-8 text-center text-slate-500">No users yet.</div>
          ) : (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="text-left p-3 font-medium text-slate-700">Name</th>
                    <th className="text-left p-3 font-medium text-slate-700">Email</th>
                    <th className="text-left p-3 font-medium text-slate-700">Role</th>
                    <th className="text-left p-3 font-medium text-slate-700">Status</th>
                    <th className="text-left p-3 font-medium text-slate-700">Division / Divisions</th>
                    <th className="text-right p-3 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-50">
                      <td className="p-3 font-medium">{u.name}</td>
                      <td className="p-3 text-slate-600">{u.email}</td>
                      <td className="p-3">{roleLabel(u.role as Parameters<typeof roleLabel>[0])}</td>
                      <td className="p-3">
                        <Badge variant={u.active !== false ? "success" : "secondary"}>
                          {u.active !== false ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="p-3 text-slate-600">
                        {u.role === "MANAGER" && u.managedDivisions?.length
                          ? u.managedDivisions.map((d) => d.name).join(", ")
                          : u.division?.name ?? "—"}
                      </td>
                      <td className="p-3 text-right">
                        {!isViewOnly && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(u)}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit / Map
                            </Button>
                            {user?.role === "SUPER_ADMIN" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-violet-600 hover:text-violet-800"
                                onClick={() => {
                                  setResetPwUser(u);
                                  setResetPwNew("");
                                  setResetPwConfirm("");
                                  setResetPwError("");
                                  setResetPwSuccess(false);
                                  setResetPwShowNew(false);
                                  setResetPwShowConfirm(false);
                                }}
                              >
                                <KeyRound className="h-4 w-4 mr-1" />
                                Reset Pwd
                              </Button>
                            )}
                            {u.active !== false && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => {
                                  setDeactivateError("");
                                  setUserToDeactivate(u);
                                }}
                              >
                                <UserX className="h-4 w-4 mr-1" />
                                Deactivate
                              </Button>
                            )}
                            {myUserId !== undefined && u.id !== myUserId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => {
                                  setDeleteError("");
                                  setUserToDelete(u);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!isViewOnly && (
      <Dialog
        open={!!userToDeactivate}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDeactivate(null);
            setDeactivateError("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate user?</DialogTitle>
          </DialogHeader>
          {userToDeactivate && (
            <>
              <p className="text-slate-600">
                <strong>{userToDeactivate.name}</strong> ({userToDeactivate.email}) will no longer be able to log in. You can reactivate them later from Edit user.
              </p>
              {deactivateError && (
                <p className="text-sm text-red-600">{deactivateError}</p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setUserToDeactivate(null);
                    setDeactivateError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deactivateUserMutation.isPending}
                  onClick={() =>
                    userToDeactivate &&
                    deactivateUserMutation.mutate(userToDeactivate.id)
                  }
                >
                  {deactivateUserMutation.isPending ? "Deactivating…" : "Deactivate"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      )}

      {!isViewOnly && (
      <Dialog
        open={!!userToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
            setDeleteError("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete user permanently?</DialogTitle>
          </DialogHeader>
          {userToDelete && (
            <>
              <p className="text-slate-600">
                <strong>{userToDelete.name}</strong> ({userToDelete.email}) will be removed from the database. This cannot be undone.
              </p>
              <p className="text-sm text-slate-500">
                If this user is linked to enquiries or workflow history, deletion will be blocked — use <strong>Deactivate</strong> instead.
              </p>
              {deleteError && (
                <p className="text-sm text-red-600">{deleteError}</p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setUserToDelete(null);
                    setDeleteError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteUserMutation.isPending}
                  onClick={() =>
                    userToDelete &&
                    deleteUserMutation.mutate(userToDelete.id)
                  }
                >
                  {deleteUserMutation.isPending ? "Deleting…" : "Delete permanently"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      )}

      {/* Reset Password dialog — Super Admin only */}
      <Dialog
        open={!!resetPwUser}
        onOpenChange={(open) => {
          if (!open) { setResetPwUser(null); setResetPwNew(""); setResetPwConfirm(""); setResetPwError(""); setResetPwSuccess(false); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-violet-600" />
              Reset password
            </DialogTitle>
          </DialogHeader>
          {resetPwUser && (
            <>
              <p className="text-sm text-slate-600">
                Set a new password for <strong>{resetPwUser.name}</strong> ({resetPwUser.email}).
              </p>
              {resetPwSuccess ? (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">
                  Password updated successfully.
                </div>
              ) : (
                <div className="space-y-4 pt-1">
                  <div className="space-y-1.5">
                    <Label>New password</Label>
                    <div className="relative">
                      <Input
                        type={resetPwShowNew ? "text" : "password"}
                        value={resetPwNew}
                        onChange={(e) => { setResetPwNew(e.target.value); setResetPwError(""); }}
                        placeholder="Min. 8 characters"
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setResetPwShowNew(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                        {resetPwShowNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirm new password</Label>
                    <div className="relative">
                      <Input
                        type={resetPwShowConfirm ? "text" : "password"}
                        value={resetPwConfirm}
                        onChange={(e) => { setResetPwConfirm(e.target.value); setResetPwError(""); }}
                        placeholder="Re-enter password"
                        className={`pr-10 ${resetPwConfirm && resetPwNew !== resetPwConfirm ? "border-red-400" : resetPwConfirm && resetPwNew === resetPwConfirm ? "border-emerald-400" : ""}`}
                      />
                      <button type="button" onClick={() => setResetPwShowConfirm(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                        {resetPwShowConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {resetPwConfirm && resetPwNew !== resetPwConfirm && (
                      <p className="text-xs text-red-600">Passwords do not match.</p>
                    )}
                    {resetPwConfirm && resetPwNew === resetPwConfirm && resetPwNew.length >= 8 && (
                      <p className="text-xs text-emerald-600">Passwords match.</p>
                    )}
                  </div>
                  {resetPwError && <p className="text-sm text-red-600">{resetPwError}</p>}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetPwUser(null)}>
                  {resetPwSuccess ? "Close" : "Cancel"}
                </Button>
                {!resetPwSuccess && (
                  <Button
                    className="bg-violet-700 hover:bg-violet-800 text-white"
                    disabled={
                      resetPasswordMutation.isPending ||
                      resetPwNew.length < 8 ||
                      resetPwNew !== resetPwConfirm
                    }
                    onClick={() => {
                      if (resetPwUser) resetPasswordMutation.mutate({ id: resetPwUser.id, password: resetPwNew });
                    }}
                  >
                    {resetPasswordMutation.isPending ? "Updating…" : "Update password"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create user dialog - hidden for MD */}
      {!isViewOnly && (
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setError(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Password (min 8 characters)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">Marketing / Sales</SelectItem>
                  <SelectItem value="SUPERVISOR">Production</SelectItem>
                  <SelectItem value="MANAGER">Division Head (Manager)</SelectItem>
                  <SelectItem value="ACCOUNTS">Accounts</SelectItem>
                  <SelectItem value="MANAGING_DIRECTOR">Managing Director</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "MANAGER" ? (
              <div className="space-y-2">
                <Label>Map to divisions (Division Head of)</Label>
                <div className="flex flex-wrap gap-2">
                  {divisions.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={divisionIds.includes(d.id)}
                        onChange={() => toggleCreateDivision(d.id)}
                      />
                      <span>{d.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Division (optional)</Label>
                <Select value={divisionId} onValueChange={setDivisionId}>
                  <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                  <SelectContent>
                    {divisions.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create user"}
              </Button>
          </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>
      )}

      {/* Edit user / map to division dialog - hidden for MD */}
      {!isViewOnly && (
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) setEditUser(null); setError(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user & map to division</DialogTitle>
          </DialogHeader>
          {editUser && (
            <form onSubmit={handleUpdate} className="space-y-4">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>New password (leave blank to keep)</Label>
                <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} minLength={8} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">Marketing / Sales</SelectItem>
                    <SelectItem value="SUPERVISOR">Production</SelectItem>
                    <SelectItem value="MANAGER">Division Head (Manager)</SelectItem>
                    <SelectItem value="ACCOUNTS">Accounts</SelectItem>
                    <SelectItem value="MANAGING_DIRECTOR">Managing Director</SelectItem>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                <span>Active (can log in)</span>
              </label>
              {editRole === "MANAGER" ? (
                <div className="space-y-2">
                  <Label>Map to divisions (Division Head of)</Label>
                  <div className="flex flex-wrap gap-2">
                    {divisions.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={editDivisionIds.includes(d.id)}
                          onChange={() => toggleEditDivision(d.id)}
                        />
                        <span>{d.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Division (optional)</Label>
                  <Select value={editDivisionId} onValueChange={setEditDivisionId}>
                    <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                    <SelectContent>
                      {divisions.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
