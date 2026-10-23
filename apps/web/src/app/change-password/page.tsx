"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { Alert, Button, Input, Label } from "@/components/ui";

export default function ChangePasswordPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({
        currentPassword: user?.must_change_password
          ? undefined
          : currentPassword || undefined,
        newPassword,
      });
      await refreshUser();
      setSuccess("Password updated");
      setTimeout(() => router.replace("/dashboard"), 600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            Change password
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {user.must_change_password
              ? "You must set a new password before continuing."
              : "Update your account password."}
          </p>
        </div>
        {error ? <Alert>{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}
        {!user.must_change_password ? (
          <div>
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
        ) : null}
        <div>
          <Label htmlFor="new">New password</Label>
          <Input
            id="new"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Saving…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
