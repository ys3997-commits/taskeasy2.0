"use client";

import { ChangeEvent, DragEvent, useEffect, useId, useState } from "react";
import {
  MAX_TASK_ATTACHMENT_BYTES,
  MAX_TASK_ATTACHMENTS,
  TASK_ATTACHMENT_ACCEPT,
  attachmentExtension,
  taskAttachmentContentType,
} from "@rajshree/shared";
import { Upload, X } from "lucide-react";
import { formatFileSize } from "@/lib/attachments";
import { cn } from "@/lib/utils";
import { Label } from "./ui";

const MAX_MB = MAX_TASK_ATTACHMENT_BYTES / (1024 * 1024);

function fileKey(file: File, index: number): string {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
}

function badgeLabel(fileName: string): string {
  const ext = attachmentExtension(fileName);
  if (ext === "jpeg") return "JPG";
  if (ext === "docx") return "DOC";
  if (ext === "xlsx") return "XLS";
  if (ext === "pptx") return "PPT";
  return (ext || "FILE").slice(0, 4).toUpperCase();
}

export function TaskAttachmentField({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const full = files.length >= MAX_TASK_ATTACHMENTS;

  useEffect(() => {
    const urls = files.map((file) => {
      const type = taskAttachmentContentType(file.name);
      if (!type?.startsWith("image/") || type === "image/heic" || type === "image/heif") return "";
      return URL.createObjectURL(file);
    });
    setPreviews(urls);
    return () => {
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [files]);

  function addFiles(incoming: FileList | File[]) {
    const next = [...files];
    const problems: string[] = [];
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_TASK_ATTACHMENTS) {
        problems.push(`You can attach up to ${MAX_TASK_ATTACHMENTS} files at a time.`);
        break;
      }
      if (!taskAttachmentContentType(file.name)) {
        problems.push(`${file.name} is not a supported document or image.`);
        continue;
      }
      if (file.size <= 0) {
        problems.push(`${file.name} is empty.`);
        continue;
      }
      if (file.size > MAX_TASK_ATTACHMENT_BYTES) {
        problems.push(`${file.name} is larger than ${MAX_MB} MB.`);
        continue;
      }
      const duplicate = next.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
      );
      if (duplicate) {
        problems.push(`${file.name} is already attached.`);
        continue;
      }
      next.push(file);
    }
    setNotes(problems);
    if (next.length !== files.length) onChange(next);
  }

  function removeFile(index: number) {
    setNotes([]);
    onChange(files.filter((_, i) => i !== index));
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
  }

  function onDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (disabled || full) return;
    setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled || full) return;
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) addFiles(event.target.files);
    event.target.value = "";
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId} className="mb-0">
          Attachments
        </Label>
        <span className="text-xs text-ink-500">
          {files.length} of {MAX_TASK_ATTACHMENTS}
        </span>
      </div>
      <label
        htmlFor={disabled || full ? undefined : inputId}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-center transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100",
          dragging ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-ink-50 hover:border-brand-500 hover:bg-brand-50",
          (disabled || full) && "cursor-default opacity-70 hover:border-ink-200 hover:bg-ink-50"
        )}
      >
        <Upload className="h-4 w-4 text-brand-600" aria-hidden />
        <span className="text-sm font-medium text-ink-900">
          {full ? `${MAX_TASK_ATTACHMENTS} files attached` : "Click to browse"}
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={TASK_ATTACHMENT_ACCEPT}
          className="sr-only"
          disabled={disabled || full}
          onChange={onInput}
        />
      </label>
      {notes.length ? (
        <ul className="mt-2 space-y-1 text-sm text-red-700">
          {notes.map((note, index) => (
            <li key={`${note}:${index}`}>{note}</li>
          ))}
        </ul>
      ) : null}
      {files.length ? (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => (
            <li
              key={fileKey(file, index)}
              className="flex items-center gap-3 rounded-md border border-ink-200 bg-white px-2 py-2"
            >
              {previews[index] ? (
                <img
                  src={previews[index]}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-ink-100 text-[10px] font-semibold tracking-wide text-ink-700">
                  {badgeLabel(file.name)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-900">{file.name}</span>
                <span className="block text-xs text-ink-500">{formatFileSize(file.size)}</span>
              </span>
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => removeFile(index)}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
