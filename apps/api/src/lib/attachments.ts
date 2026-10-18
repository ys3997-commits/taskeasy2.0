import { randomUUID } from "crypto";
import {
  MAX_TASK_ATTACHMENT_BYTES,
  MAX_TASK_ATTACHMENTS,
  attachmentOpensInline,
  taskAttachmentContentType,
  type TaskAttachment,
} from "@rajshree/shared";
import { getAdminClient } from "./supabase";
import { AppError } from "./errors";

const BUCKET = "task-attachments";
const SIGNED_URL_SECONDS = 60 * 60;
const MAX_MB = MAX_TASK_ATTACHMENT_BYTES / (1024 * 1024);

export interface StagedAttachment {
  path: string;
  objectName: string;
  fileName: string;
  contentType: string;
}

interface PreparedUpload extends StagedAttachment {
  signedUrl: string;
}

let bucketReady: Promise<void> | null = null;

function maxSizeMessage(fileName: string): string {
  return `"${fileName}" is larger than ${MAX_MB} MB`;
}

function normalizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, "").trim() || "";
  if (!base || base === "." || base === "..") {
    throw new AppError(400, "Choose a file with a name", "validation_error");
  }
  const contentType = taskAttachmentContentType(base);
  if (!contentType) {
    throw new AppError(
      400,
      `"${base}" is not a supported document or image`,
      "validation_error"
    );
  }
  if (base.length <= 120) return base;
  const dot = base.lastIndexOf(".");
  const extension = base.slice(dot);
  const stem = base.slice(0, Math.max(1, 120 - extension.length)).trim() || "file";
  return `${stem}${extension}`;
}

function encodeObjectName(fileName: string): string {
  const encoded = Buffer.from(fileName, "utf8").toString("base64url");
  return `${randomUUID()}__${encoded}`;
}

function decodeObjectName(objectName: string): { id: string; fileName: string } | null {
  const splitAt = objectName.indexOf("__");
  if (splitAt !== 36) return null;
  const id = objectName.slice(0, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  try {
    const fileName = Buffer.from(objectName.slice(splitAt + 2), "base64url").toString("utf8");
    if (!fileName || fileName.length > 255 || /[/\\\u0000]/.test(fileName)) return null;
    if (!taskAttachmentContentType(fileName)) return null;
    return { id, fileName };
  } catch {
    return null;
  }
}

function pendingPath(userId: string, objectName: string): string {
  return `pending/${userId}/${objectName}`;
}

function parsePendingPath(userId: string, path: string): StagedAttachment {
  const prefix = `pending/${userId}/`;
  if (!path.startsWith(prefix) || path.includes("..") || path.slice(prefix.length).includes("/")) {
    throw new AppError(400, "An attachment is not valid. Attach it again.", "validation_error");
  }
  const objectName = path.slice(prefix.length);
  const decoded = decodeObjectName(objectName);
  if (!decoded) {
    throw new AppError(400, "An attachment is not valid. Attach it again.", "validation_error");
  }
  const contentType = taskAttachmentContentType(decoded.fileName);
  if (!contentType) {
    throw new AppError(
      400,
      `"${decoded.fileName}" is not a supported document or image`,
      "validation_error"
    );
  }
  return { path, objectName, fileName: decoded.fileName, contentType };
}

async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = setupBucket().catch((err) => {
      bucketReady = null;
      throw err;
    });
  }
  return bucketReady;
}

async function setupBucket(): Promise<void> {
  const admin = getAdminClient();
  const existing = await admin.storage.getBucket(BUCKET);
  if (existing.error || !existing.data) {
    const created = await admin.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_TASK_ATTACHMENT_BYTES,
    });
    if (created.error && !/already exists/i.test(created.error.message || "")) {
      throw new AppError(500, "File storage is not available", "storage_unavailable");
    }
    return;
  }
  const limit = Number(existing.data.file_size_limit ?? 0);
  if (existing.data.public || !Number.isFinite(limit) || limit < MAX_TASK_ATTACHMENT_BYTES) {
    const updated = await admin.storage.updateBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_TASK_ATTACHMENT_BYTES,
    });
    if (updated.error) {
      throw new AppError(500, "File storage is not available", "storage_unavailable");
    }
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function sweepStalePending(userId: string): Promise<void> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).list(`pending/${userId}`, { limit: 100 });
  if (error || !data?.length) return;
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const stale = data.filter((item) => {
    if (!item.name || !item.id || !item.created_at) return false;
    return new Date(item.created_at).getTime() < cutoff;
  });
  if (!stale.length) return;
  await admin.storage.from(BUCKET).remove(stale.map((item) => pendingPath(userId, item.name)));
}

function assertFileSize(fileName: string, size: number): void {
  if (!Number.isFinite(size) || size <= 0) {
    throw new AppError(400, `"${fileName}" is empty`, "validation_error");
  }
  if (size > MAX_TASK_ATTACHMENT_BYTES) {
    throw new AppError(400, maxSizeMessage(fileName), "validation_error");
  }
}

export async function prepareAttachmentUploads(
  userId: string,
  files: { name: string; size: number }[]
): Promise<PreparedUpload[]> {
  if (files.length > MAX_TASK_ATTACHMENTS) {
    throw new AppError(
      400,
      `You can attach up to ${MAX_TASK_ATTACHMENTS} files`,
      "validation_error"
    );
  }
  await ensureBucket();
  await sweepStalePending(userId);

  const admin = getAdminClient();
  const prepared: PreparedUpload[] = [];
  for (const file of files) {
    const fileName = normalizeFileName(file.name);
    assertFileSize(fileName, file.size);
    const objectName = encodeObjectName(fileName);
    const path = pendingPath(userId, objectName);
    const contentType = taskAttachmentContentType(fileName)!;
    const signed = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data?.signedUrl) {
      throw new AppError(500, `Could not prepare ${fileName} for upload`, "storage_error");
    }
    prepared.push({
      path,
      objectName,
      fileName,
      contentType,
      signedUrl: signed.data.signedUrl,
    });
  }
  return prepared;
}

export async function discardPendingAttachments(userId: string, paths: string[]): Promise<void> {
  const unique = [...new Set(paths)];
  const owned = unique.filter((path) => {
    try {
      parsePendingPath(userId, path);
      return true;
    } catch {
      return false;
    }
  });
  if (!owned.length) return;
  await ensureBucket();
  await getAdminClient().storage.from(BUCKET).remove(owned);
}

async function objectSize(path: string): Promise<number | null> {
  const admin = getAdminClient();
  const info = await admin.storage.from(BUCKET).info(path);
  if (!info.error && info.data) {
    const size = Number(info.data.size ?? info.data.metadata?.size ?? 0);
    if (Number.isFinite(size) && size > 0) return size;
  }
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const listed = await admin.storage.from(BUCKET).list(folder, { limit: 20, search: name });
  const match = listed.data?.find((item) => item.name === name);
  const size = Number(match?.metadata?.size ?? match?.metadata?.contentLength ?? 0);
  return Number.isFinite(size) && size > 0 ? size : null;
}

export async function stageTaskAttachments(
  userId: string,
  paths: string[]
): Promise<StagedAttachment[]> {
  const unique = [...new Set(paths)];
  if (unique.length > MAX_TASK_ATTACHMENTS) {
    throw new AppError(
      400,
      `You can attach up to ${MAX_TASK_ATTACHMENTS} files`,
      "validation_error"
    );
  }
  await ensureBucket();
  const staged = unique.map((path) => parsePendingPath(userId, path));
  for (const file of staged) {
    const size = await objectSize(file.path);
    if (size == null) {
      throw new AppError(
        400,
        `"${file.fileName}" did not finish uploading. Attach it again.`,
        "validation_error"
      );
    }
    assertFileSize(file.fileName, size);
  }
  return staged;
}

export async function commitTaskAttachments(
  taskIds: string[],
  staged: StagedAttachment[]
): Promise<void> {
  if (!staged.length || !taskIds.length) return;
  const admin = getAdminClient();
  const storage = admin.storage.from(BUCKET);
  const copied: string[] = [];
  try {
    for (const taskId of taskIds) {
      for (const file of staged) {
        const dest = `tasks/${taskId}/${file.objectName}`;
        const { error } = await storage.copy(file.path, dest);
        if (error) throw error;
        copied.push(dest);
      }
    }
    const removed = await storage.remove(staged.map((file) => file.path));
    if (removed.error) console.error(removed.error);
  } catch (err) {
    if (copied.length) {
      await storage.remove(copied);
    }
    console.error(err);
    throw new AppError(500, "The attachments could not be saved. Try again.", "storage_error");
  }
}

function withDownloadName(signedUrl: string, fileName: string): string {
  const joiner = signedUrl.includes("?") ? "&" : "?";
  return `${signedUrl}${joiner}download=${encodeURIComponent(fileName)}`;
}

export async function attachmentLinksForTasks(
  taskIds: string[]
): Promise<Record<string, TaskAttachment[]>> {
  if (!taskIds.length) return {};
  try {
    await ensureBucket();
  } catch (err) {
    console.error(err);
    return {};
  }

  const admin = getAdminClient();
  const listed = await mapPool(taskIds, 8, async (taskId) => {
    const { data, error } = await admin.storage.from(BUCKET).list(`tasks/${taskId}`, { limit: 20 });
    if (error || !data) return [];
    return data.flatMap((item) => {
      if (!item.name || !item.id) return [];
      const decoded = decodeObjectName(item.name);
      if (!decoded) return [];
      const contentType = taskAttachmentContentType(decoded.fileName);
      if (!contentType) return [];
      const size = Number(item.metadata?.size ?? item.metadata?.contentLength ?? 0);
      return [
        {
          taskId,
          path: `tasks/${taskId}/${item.name}`,
          id: decoded.id,
          fileName: decoded.fileName,
          contentType,
          size: Number.isFinite(size) ? size : 0,
        },
      ];
    });
  });

  const files = listed.flat();
  if (!files.length) return {};

  const signed = await admin.storage
    .from(BUCKET)
    .createSignedUrls(
      files.map((file) => file.path),
      SIGNED_URL_SECONDS
    );
  if (signed.error || !signed.data) {
    console.error(signed.error);
    return {};
  }

  const result: Record<string, TaskAttachment[]> = {};
  files.forEach((file, index) => {
    const signedUrl = signed.data?.[index]?.signedUrl;
    if (!signedUrl) return;
    const url = attachmentOpensInline(file.contentType)
      ? signedUrl
      : withDownloadName(signedUrl, file.fileName);
    const row: TaskAttachment = {
      id: file.id,
      file_name: file.fileName,
      content_type: file.contentType,
      size_bytes: file.size,
      url,
    };
    (result[file.taskId] ??= []).push(row);
  });
  for (const rows of Object.values(result)) {
    rows.sort((a, b) => a.file_name.localeCompare(b.file_name));
  }
  return result;
}

export async function removeTaskAttachments(taskIds: string[]): Promise<void> {
  if (!taskIds.length) return;
  try {
    await ensureBucket();
    const admin = getAdminClient();
    const paths = (
      await mapPool(taskIds, 8, async (taskId) => {
        const { data, error } = await admin.storage.from(BUCKET).list(`tasks/${taskId}`, {
          limit: 100,
        });
        if (error || !data) return [];
        return data
          .filter((item) => item.name && item.id)
          .map((item) => `tasks/${taskId}/${item.name}`);
      })
    ).flat();
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) console.error(error);
    }
  } catch (err) {
    console.error(err);
  }
}
