// Replaced next/image with native img
import { isCsvType, isPdfType } from "@/lib/files";
import type { Attachment } from "@/lib/types";
import { Loader } from "./elements/loader";
import { CrossSmallIcon, FileIcon, ShareIcon, SpreadsheetIcon } from "./icons";
import { Button } from "./ui/button";

function getDisplayNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (!last) {
      return null;
    }
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return null;
  }
}

function getHostFromUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const displayName = name.trim().length > 0 ? name : (getDisplayNameFromUrl(url) ?? "Attachment");
  const host = url ? getHostFromUrl(url) : null;
  const title = host ? `${displayName} (${host})` : displayName;

  const renderPreview = () => {
    if (contentType?.startsWith("image") && url) {
      return (
        <img
          alt={displayName}
          className="size-full object-cover"
          src={url}
        />
      );
    }

    if (isPdfType(contentType)) {
      return (
        <div className="flex size-full flex-col items-center justify-center gap-1 bg-red-50 dark:bg-red-950">
          <FileIcon size={20} />
          <span className="font-medium text-[8px] text-red-600 dark:text-red-400">
            PDF
          </span>
        </div>
      );
    }

    if (isCsvType(contentType)) {
      return (
        <div className="flex size-full flex-col items-center justify-center gap-1 bg-green-50 dark:bg-green-950">
          <SpreadsheetIcon size={20} />
          <span className="font-medium text-[8px] text-green-600 dark:text-green-400">
            CSV
          </span>
        </div>
      );
    }

    return (
      <div className="flex size-full items-center justify-center text-muted-foreground text-xs">
        <FileIcon size={20} />
      </div>
    );
  };

  return (
    <div
      className="group relative size-16 overflow-hidden rounded-lg border bg-muted"
      data-testid="input-attachment-preview"
      title={title}
    >
      {renderPreview()}

      {isUploading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50"
          data-testid="input-attachment-loader"
        >
          <Loader size={16} />
        </div>
      )}

      {Boolean(url) && !isUploading && (
        <a
          aria-label={`Open ${displayName}`}
          className="absolute top-0.5 left-0.5 inline-flex size-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
          href={url}
          rel="noopener"
          target="_blank"
          title={`Open ${displayName}`}
        >
          <ShareIcon size={10} />
        </a>
      )}

      {onRemove && !isUploading && (
        <Button
          className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onRemove}
          size="sm"
          variant="destructive"
        >
          <CrossSmallIcon size={8} />
        </Button>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
        <div className="truncate">{displayName}</div>
      </div>
    </div>
  );
};
