"use client";

import { FileIcon, FolderIcon } from "lucide-react";
import { useMemo } from "react";

interface FileExplorerProps {
  files: [string, string][];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

/**
 * Groups flat file paths into a simple tree display.
 */
export function FileExplorer({ files, selectedFile, onSelectFile }: FileExplorerProps) {
  // Sort files by path for consistent ordering
  const sortedFiles = useMemo(
    () => [...files].sort(([a], [b]) => a.localeCompare(b)),
    [files],
  );

  if (sortedFiles.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No files yet...
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Files
      </div>
      {sortedFiles.map(([path]) => {
        const fileName = path.split("/").pop() ?? path;
        const depth = path.split("/").length - 1;
        const isSelected = path === selectedFile;

        return (
          <button
            key={path}
            onClick={() => onSelectFile(path)}
            className={`w-full flex items-center gap-2 px-3 py-1 text-xs font-mono text-left transition-colors ${
              isSelected
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            style={{ paddingLeft: `${12 + depth * 12}px` }}
            title={path}
          >
            <FileIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{fileName}</span>
          </button>
        );
      })}
    </div>
  );
}
