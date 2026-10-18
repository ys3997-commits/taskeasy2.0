export const MAX_TASK_ATTACHMENTS = 15;
export const MAX_TASK_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
};

export const TASK_ATTACHMENT_ACCEPT = Object.keys(CONTENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export function attachmentExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function taskAttachmentContentType(fileName: string): string | null {
  return CONTENT_TYPES[attachmentExtension(fileName)] ?? null;
}

export function attachmentOpensInline(contentType: string): boolean {
  return (
    contentType.startsWith("image/") ||
    contentType === "application/pdf" ||
    contentType.startsWith("text/")
  );
}
