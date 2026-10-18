import { ApiError } from "@/lib/api";

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export async function uploadSignedAttachment(
  signedUrl: string,
  file: File,
  contentType: string
): Promise<void> {
  const typed =
    file.type === contentType
      ? file
      : new File([file], file.name, { type: contentType, lastModified: file.lastModified });
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", typed);
  const res = await fetch(signedUrl, {
    method: "PUT",
    body,
    headers: { "x-upsert": "false" },
  });
  if (!res.ok) {
    let message = `Could not upload ${file.name}`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      if (data.message) message = data.message;
      else if (data.error) message = data.error;
    } catch {
      // The storage service sometimes returns an empty body.
    }
    throw new ApiError(res.status, message);
  }
}
