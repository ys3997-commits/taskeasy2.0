"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Task, TaskActivityLog, TaskApproval } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card, Input, Label, StatusBadge, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, fullName } from "@/lib/utils";

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [approvals, setApprovals] = useState<TaskApproval[]>([]);
  const [activity, setActivity] = useState<TaskActivityLog[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");

  async function load() {
    const res = await api.getTask(params.id);
    setTask(res.task);
    setApprovals(res.approvals);
    setActivity(res.activity);
    setEditTitle(res.task.title);
    setEditDescription(res.task.description);
    setEditDeadline(res.task.deadline.slice(0, 16));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message || "Failed to load task"));
  }, [params.id]);

  if (!task || !user) {
    return (
      <AppShell>
        <p className="text-sm text-ink-500">{error || "Loading…"}</p>
      </AppShell>
    );
  }

  const isReceiver = task.receiver_id === user.id;
  const isDelegator = task.delegator_id === user.id;
  const canEdit =
    (isDelegator || user.role === "admin") &&
    task.lifecycle !== "completed" &&
    task.lifecycle !== "cancelled";

  async function run(action: () => Promise<unknown>, success: string) {
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    await run(
      () =>
        api.updateTask(task!.id, {
          title: editTitle,
          description: editDescription,
          deadline: new Date(editDeadline).toISOString(),
        }),
      "Task updated"
    );
    setEditing(false);
  }

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {task.display_status ? <StatusBadge status={task.display_status} /> : null}
            <span className="text-sm text-ink-500">
              {task.task_type === "one_time" ? "One-time" : "Recurring occurrence"}
            </span>
          </div>
        </div>
        <Button variant="secondary" onClick={() => router.back()}>
          Back
        </Button>
      </div>

      {error ? <div className="mb-3"><Alert>{error}</Alert></div> : null}
      {message ? <div className="mb-3"><Alert variant="success">{message}</Alert></div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 space-y-4">
          {editing ? (
            <form onSubmit={saveEdit} className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  rows={6}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input
                  type="datetime-local"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Save</Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-ink-500">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-ink-900">{task.description}</p>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-ink-500">Deadline</dt>
                  <dd className="font-medium">{formatDateTime(task.deadline)}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Approval required</dt>
                  <dd className="font-medium">{task.approval_required ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Delegator</dt>
                  <dd className="font-medium">
                    {task.delegator ? fullName(task.delegator) : "—"}
                    {task.delegator ? (
                      <span className="text-ink-500"> ({task.delegator.username})</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Receiver</dt>
                  <dd className="font-medium">
                    {task.receiver ? fullName(task.receiver) : "—"}
                    {task.receiver ? (
                      <span className="text-ink-500"> ({task.receiver.username})</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Created</dt>
                  <dd className="font-medium">{formatDateTime(task.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Updated</dt>
                  <dd className="font-medium">{formatDateTime(task.updated_at)}</dd>
                </div>
              </dl>
            </>
          )}
        </Card>

        <Card className="space-y-3">
          <p className="text-sm font-medium text-ink-900">Actions</p>
          {isReceiver && task.lifecycle === "active" ? (
            <Button
              className="w-full"
              onClick={() =>
                run(
                  () => api.completeTask(task.id),
                  task.approval_required
                    ? "Submitted for approval"
                    : "Marked completed"
                )
              }
            >
              {task.approval_required ? "Submit for approval" : "Mark completed"}
            </Button>
          ) : null}
          {isDelegator && task.lifecycle === "awaiting_approval" ? (
            <>
              <Textarea
                placeholder="Optional approval comment / required for rejection"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
              <Button
                className="w-full"
                onClick={() =>
                  run(() => api.approveTask(task.id, comment || undefined), "Approved")
                }
              >
                Approve
              </Button>
              <Button
                className="w-full"
                variant="danger"
                onClick={() => {
                  if (!comment.trim()) {
                    setError("A comment is required when rejecting");
                    return;
                  }
                  run(() => api.rejectTask(task.id, comment.trim()), "Rejected");
                }}
              >
                Reject
              </Button>
            </>
          ) : null}
          {canEdit && !editing ? (
            <Button className="w-full" variant="secondary" onClick={() => setEditing(true)}>
              Edit task
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              className="w-full"
              variant="danger"
              onClick={() => {
                if (!confirm("Cancel this task? This cannot be undone.")) return;
                run(() => api.cancelTask(task.id), "Task cancelled");
              }}
            >
              Cancel task
            </Button>
          ) : null}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Approval history</h2>
          {approvals.length === 0 ? (
            <p className="text-sm text-ink-500">No approval records.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {approvals.map((a) => (
                <li key={a.id} className="rounded-md border border-ink-100 p-3">
                  <p className="font-medium capitalize">{a.decision}</p>
                  <p className="text-ink-500">Submitted {formatDateTime(a.submitted_at)}</p>
                  {a.decided_at ? (
                    <p className="text-ink-500">Decided {formatDateTime(a.decided_at)}</p>
                  ) : null}
                  {a.comments ? <p className="mt-1">{a.comments}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-ink-500">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 border-b border-ink-100 pb-2">
                  <span className="font-medium">{a.action}</span>
                  <span className="text-ink-500">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
