"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

export default function NewTaskPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [receiverIds, setReceiverIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listActiveStaff().then((res) => setStaff(res.data)).catch(() => undefined);
  }, []);

  function toggleReceiver(id: string) {
    setReceiverIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!receiverIds.length) {
      setError("Select at least one receiver");
      return;
    }
    setSaving(true);
    try {
      const deadlineIso = new Date(deadline).toISOString();
      const { data } = await api.createTask({
        title,
        description,
        deadline: deadlineIso,
        approval_required: approvalRequired,
        receiver_ids: receiverIds,
      });
      if (data.length === 1) router.push(`/tasks/${data[0].id}`);
      else router.push("/tasks/delegated");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink-900">Create task</h1>
      <p className="mt-1 text-sm text-ink-500">
        Assign a one-time task. Multiple receivers create independent assignments.
      </p>

      <form onSubmit={onSubmit} className="mt-6 max-w-2xl space-y-4 rounded-lg border border-ink-200 bg-white p-5">
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="deadline">Deadline</Label>
          <Input
            id="deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={approvalRequired}
            onChange={(e) => setApprovalRequired(e.target.checked)}
          />
          Approval required (you will review before it is marked completed)
        </label>
        <div>
          <Label>Receivers</Label>
          <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-md border border-ink-200 p-3">
            {staff
              .filter((s) => s.id !== user?.id)
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={receiverIds.includes(s.id)}
                    onChange={() => toggleReceiver(s.id)}
                  />
                  {fullName(s)}{" "}
                  <span className="text-ink-500">({s.username})</span>
                </label>
              ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create task"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
