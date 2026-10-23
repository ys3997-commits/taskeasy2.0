"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  canReceiveAssignedTasks,
  isBeforeTodayIst,
  istInstant,
  todayIst,
  type Profile,
} from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { TaskAttachmentField } from "@/components/task-attachment-field";
import { Alert, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { uploadSignedAttachment } from "@/lib/attachments";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

export default function NewTaskPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [deadline, setDeadline] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [receiverId, setReceiverId] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "creating">("idle");

  useEffect(() => {
    api.listActiveStaff().then((res) => setStaff(res.data)).catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!receiverId) {
      setError("Select a receiver");
      return;
    }
    if (isBeforeTodayIst(deadline)) {
      setError("Deadline must be today or a future date");
      return;
    }
    let uploaded: string[] = [];
    try {
      if (files.length) {
        setPhase("uploading");
        const prepared = await api.prepareTaskAttachments(
          files.map((file) => ({ name: file.name, type: file.type, size: file.size }))
        );
        uploaded = prepared.uploads.map((upload) => upload.path);
        await Promise.all(
          prepared.uploads.map((upload, index) =>
            uploadSignedAttachment(upload.signedUrl, files[index], upload.contentType)
          )
        );
      }
      setPhase("creating");
      const deadlineIso = istInstant(deadline, "23:59:59").toISOString();
      const title = description.trim().split("\n")[0].slice(0, 200);
      await api.createTask({
        title,
        description,
        deadline: deadlineIso,
        approval_required: approvalRequired,
        receiver_ids: [receiverId],
        attachment_paths: uploaded.length ? uploaded : undefined,
      });
      router.push("/tasks/delegated");
    } catch (err) {
      if (uploaded.length) {
        await api.discardTaskAttachments(uploaded).catch(() => undefined);
      }
      setError(err instanceof ApiError ? err.message : "Failed to create task");
      setPhase("idle");
    }
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink-900">Create One-Time Task</h1>
      <p className="mt-1 text-sm text-ink-500">Assign a one-time task.</p>

      <form onSubmit={onSubmit} className="mt-6 w-full max-w-2xl space-y-4 rounded-lg border border-ink-200 bg-white p-4 sm:p-5">
        {error ? <Alert>{error}</Alert> : null}
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
        <TaskAttachmentField files={files} onChange={setFiles} disabled={phase !== "idle"} />
        <div>
          <Label htmlFor="deadline">Deadline</Label>
          <Input
            id="deadline"
            type="date"
            min={todayIst()}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-ink-500">Today or a future date.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={approvalRequired}
            onChange={(e) => setApprovalRequired(e.target.checked)}
          />
          Approval required
        </label>
        <div>
          <Label htmlFor="receiver">Receiver</Label>
          <Select
            id="receiver"
            value={receiverId}
            onChange={(e) => setReceiverId(e.target.value)}
            required
          >
            <option value="">Select a name</option>
            {staff
              .filter((s) => s.id !== user?.id && canReceiveAssignedTasks(s))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="w-full sm:w-auto" disabled={phase !== "idle"}>
            {phase === "uploading"
              ? "Uploading attachments…"
              : phase === "creating"
                ? "Creating…"
                : "Create One-Time Task"}
          </Button>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={phase !== "idle"} onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
