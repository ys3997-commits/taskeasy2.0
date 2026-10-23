"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { capitalizeName, type Profile } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card, Input, Label, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, fullName } from "@/lib/utils";

export default function StaffPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [createdUsername, setCreatedUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [workDays, setWorkDays] = useState<6 | 7>(6);
  const [password, setPassword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<{
    name: string;
    username: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function roleLabel(value: Profile["role"]) {
    return value === "admin" ? "Admin" : "Team";
  }

  function capitalFirst(value: string) {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  async function load() {
    const res = await api.listStaff();
    setStaff(
      [...res.data].sort((a, b) => {
        const roleOrder = Number(a.role !== "admin") - Number(b.role !== "admin");
        if (roleOrder !== 0) return roleOrder;
        return fullName(a).localeCompare(fullName(b), undefined, { sensitivity: "base" });
      })
    );
  }

  useEffect(() => {
    if (!loading && user && user.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "admin") {
      load().catch((e) => setError(e.message || "Failed to load staff"));
    }
  }, [user]);

  if (!user || user.role !== "admin") return null;

  function resetForm() {
    setEditingId(null);
    setFirstName("");
    setLastName("");
    setRole("staff");
    setWorkDays(6);
    setPassword("");
  }

  function startEdit(member: Profile) {
    setError("");
    setCreatedUsername("");
    setEditingId(member.id);
    setFirstName(capitalizeName(member.first_name));
    setLastName(capitalizeName(member.last_name));
    setRole(member.role);
    setWorkDays(member.work_days === 6 ? 6 : 7);
    setPassword("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCreatedUsername("");
    setSaving(true);
    const first_name = capitalizeName(firstName);
    const last_name = capitalizeName(lastName);
    try {
      if (editingId) {
        await api.updateStaff(editingId, {
          first_name,
          last_name,
          role,
          work_days: workDays,
          ...(password ? { password } : {}),
        });
        resetForm();
      } else {
        const res = await api.createStaff({
          first_name,
          last_name,
          role,
          work_days: workDays,
          password,
        });
        setCreatedUsername(res.user.username);
        resetForm();
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save team member");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(member: Profile) {
    try {
      await api.updateStaff(member.id, { is_active: !member.is_active });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function resetPassword(member: Profile) {
    setError("");
    setResettingId(member.id);
    try {
      const res = await api.resetStaffPassword(member.id);
      setResetNotice({
        name: fullName(member),
        username: res.username,
        password: res.temporary_password,
      });
      setCopied(false);
      setConfirmResetId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password");
    } finally {
      setResettingId(null);
    }
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink-900">Team member</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold">
            {editingId ? "Edit team member" : "Add team member"}
          </h2>
          <form onSubmit={onSubmit} className="space-y-3">
            {error ? <Alert>{error}</Alert> : null}
            {createdUsername ? (
              <Alert variant="success">
                Created <strong>{createdUsername}</strong>. They can sign in with that username
                and the password you entered, then must change the password on first login.
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>First name</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(capitalFirst(e.target.value))}
                  required
                />
              </div>
              <div>
                <Label>Last name</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(capitalFirst(e.target.value))}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}>
                <option value="staff">Team</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div>
              <Label>Work week</Label>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-md border border-ink-200 p-1">
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm font-medium ${
                    workDays === 6 ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-50"
                  }`}
                  onClick={() => setWorkDays(6)}
                >
                  6 days
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm font-medium ${
                    workDays === 7 ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-50"
                  }`}
                  onClick={() => setWorkDays(7)}
                >
                  7 days
                </button>
              </div>
            </div>
            <div>
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required={!editingId}
                placeholder={editingId ? "Leave blank to keep the current password" : undefined}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create account"}
              </Button>
              {editingId ? (
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={resetForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold">Directory</h2>
          {resetNotice ? (
            <Alert variant="success">
              <p>
                Temporary password for <strong>{resetNotice.name}</strong> ({resetNotice.username}
                ). It is shown only now. They must choose a new password at the next sign-in.
              </p>
              <p className="mt-2 break-all font-mono text-sm">{resetNotice.password}</p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={async () => {
                  await navigator.clipboard.writeText(resetNotice.password);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy Password"}
              </Button>
            </Alert>
          ) : null}
          <div className="space-y-3">
            {staff.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-100 p-3"
              >
                <div>
                  <p className="font-medium">{fullName(member)}</p>
                  <p className="text-xs text-ink-500">
                    {member.username} · {roleLabel(member.role)} ·{" "}
                    {member.work_days === 6 ? "6 days" : "7 days"}
                    {!member.is_active ? " · inactive" : ""}
                  </p>
                  <p className="text-xs text-ink-500">
                    Joined {formatDateTime(member.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => startEdit(member)}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => router.push(`/staff/${member.id}`)}
                  >
                    View Tasks
                  </Button>
                  {member.id !== user.id ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setError("");
                        setConfirmResetId(member.id);
                      }}
                    >
                      Reset Password
                    </Button>
                  ) : null}
                  <Button
                    variant={member.is_active ? "danger" : "primary"}
                    onClick={() => toggleActive(member)}
                  >
                    {member.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
                {confirmResetId === member.id ? (
                  <div className="mt-3 w-full rounded-md border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-950">
                      Replace the password for {fullName(member)}? Their current password will
                      stop working, and they must set a new one after signing in with the
                      temporary password.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="danger"
                        disabled={resettingId === member.id}
                        onClick={() => resetPassword(member)}
                      >
                        {resettingId === member.id ? "Resetting…" : "Generate Password"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={resettingId === member.id}
                        onClick={() => setConfirmResetId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
