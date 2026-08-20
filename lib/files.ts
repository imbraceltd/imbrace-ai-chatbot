/**
 * File upload utilities
 * Provides validation and type detection for file uploads
 */

export const FileMessageType = {
  IMAGE: "image",
  PDF: "pdf",
  CSV: "csv",
} as const;

export type FileMessageTypeValue =
  (typeof FileMessageType)[keyof typeof FileMessageType];

// Supported MIME types for file upload
export const SUPPORTED_MIME_TYPES = {
  // Images
  "image/jpeg": FileMessageType.IMAGE,
  "image/jpg": FileMessageType.IMAGE,
  "image/png": FileMessageType.IMAGE,
  "image/gif": FileMessageType.IMAGE,
  "image/webp": FileMessageType.IMAGE,
  // PDF
  "application/pdf": FileMessageType.PDF,
  // CSV
  "text/csv": FileMessageType.CSV,
  "application/csv": FileMessageType.CSV,
  "text/comma-separated-values": FileMessageType.CSV,
} as const;

export type SupportedMimeType = keyof typeof SUPPORTED_MIME_TYPES;

// Maximum file size in bytes (5MB)
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Get the message type based on the file's MIME type
 * @param mimeType - The MIME type of the file
 * @returns The file message type or null if unsupported
 */
export function getFileMessageType(
  mimeType: string
): FileMessageTypeValue | null {
  return (
    SUPPORTED_MIME_TYPES[mimeType as SupportedMimeType] ?? null
  );
}

/**
 * Check if a file type is supported for upload
 * @param mimeType - The MIME type to validate
 * @returns true if the file type is supported
 */
export function isValidFileType(mimeType: string): boolean {
  return mimeType in SUPPORTED_MIME_TYPES;
}

/**
 * Validate a file for upload
 * @param file - The file or blob to validate
 * @returns An object with validation result and error message if any
 */
export function validateFile(file: File | Blob): {
  valid: boolean;
  error?: string;
  fileType?: FileMessageTypeValue;
} {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: "File size should be less than 5MB",
    };
  }

  // Check file type
  const fileType = getFileMessageType(file.type);
  if (!fileType) {
    return {
      valid: false,
      error: "Unsupported file type. Please upload an image, PDF, or CSV file.",
    };
  }

  return {
    valid: true,
    fileType,
  };
}

/**
 * Get file extension from filename
 * @param filename - The filename
 * @returns The file extension without the dot
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Sanitize a filename by removing URL-unsafe characters (e.g. `#` fragment, `?` query)
 * and OS-illegal characters so the uploaded file can be safely referenced by URL.
 * Preserves the extension.
 */
export function sanitizeFileName(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  const base = lastDot === -1 ? filename : filename.slice(0, lastDot);
  const ext = lastDot === -1 ? "" : filename.slice(lastDot);

  // eslint-disable-next-line no-control-regex
  const unsafePattern = /[#?&%<>:"|*\\/\x00-\x1f\x7f]+/g;
  const cleanedBase = base
    .replace(unsafePattern, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const cleanedExt = ext.replace(unsafePattern, "");

  return (cleanedBase || "file") + cleanedExt;
}

/**
 * Check if the content type is an image
 * @param contentType - The content type to check
 * @returns true if it's an image type
 */
export function isImageType(contentType: string): boolean {
  return getFileMessageType(contentType) === FileMessageType.IMAGE;
}

/**
 * Check if the content type is a PDF
 * @param contentType - The content type to check
 * @returns true if it's a PDF type
 */
export function isPdfType(contentType: string): boolean {
  return getFileMessageType(contentType) === FileMessageType.PDF;
}

/**
 * Check if the content type is a CSV
 * @param contentType - The content type to check
 * @returns true if it's a CSV type
 */
export function isCsvType(contentType: string): boolean {
  return getFileMessageType(contentType) === FileMessageType.CSV;
}












