"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@rajshree/shared";
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
  const [createdCreds, setCreatedCreds] = useState<{
    username: string;
    temporary_password: string;
  } | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await api.listStaff();
    setStaff(res.data);
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCreatedCreds(null);
    setSaving(true);
    try {
      const res = await api.createStaff({
        first_name: firstName,
        last_name: lastName,
        email,
        role,
      });
      setCreatedCreds({
        username: res.user.username,
        temporary_password: res.temporary_password,
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setRole("staff");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create staff");
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

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink-900">Staff management</h1>
      <p className="mt-1 text-sm text-ink-500">
        Create accounts, generate usernames, and activate or deactivate staff.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold">Add staff member</h2>
          <form onSubmit={onCreate} className="space-y-3">
            {error ? <Alert>{error}</Alert> : null}
            {createdCreds ? (
              <Alert variant="success">
                Created <strong>{createdCreds.username}</strong>. Temporary password:{" "}
                <strong>{createdCreds.temporary_password}</strong>. Share securely; they must
                change it on first login.
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create account"}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold">Directory</h2>
          <div className="space-y-3">
            {staff.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-100 p-3"
              >
                <div>
                  <p className="font-medium">{fullName(member)}</p>
                  <p className="text-xs text-ink-500">
                    {member.username} · {member.email} · {member.role}
                    {!member.is_active ? " · inactive" : ""}
                  </p>
                  <p className="text-xs text-ink-500">
                    Joined {formatDateTime(member.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => router.push(`/staff/${member.id}`)}
                  >
                    View tasks
                  </Button>
                  <Button
                    variant={member.is_active ? "danger" : "primary"}
                    onClick={() => toggleActive(member)}
                  >
                    {member.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
