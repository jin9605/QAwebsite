const extensionContentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".log": "text/plain",
  ".txt": "text/plain",
  ".json": "application/json",
  ".har": "application/json",
};

export function getSafeAttachmentContentType(name: string) {
  const extension = name.trim().toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  return extension ? extensionContentTypes[extension] ?? null : null;
}

export function isInlinePreviewContentType(contentType: string) {
  return contentType.startsWith("image/") || contentType.startsWith("video/");
}
