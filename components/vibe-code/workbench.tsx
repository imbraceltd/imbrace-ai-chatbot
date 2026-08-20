"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VibeCodeMetadata } from "@/artifacts/vibe-code/client";
import { FileExplorer } from "./file-explorer";
import { CodeEditor } from "./code-editor";
import { VibeCodePreview } from "./preview";
import { VibeCodeTerminal } from "./terminal";
import { Check, ExternalLink, Loader2, Share2 } from "lucide-react";
import { ActionRunner } from "@/lib/webcontainer/action-runner";
import { getWebContainer } from "@/lib/webcontainer";
import { useArtifact } from "@/hooks/use-artifact";

interface ParsedAction {
  type: "file" | "shell" | "start";
  filePath?: string;
  content: string;
}

/**
 * Decode HTML entities that AI sometimes outputs in code (e.g. &lt; → <)
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Parse files from content. Supports multiple tag formats:
 * - <boltAction type="file" filePath="...">content</boltAction>
 * - <file path="...">content</file>
 */
function parseFilesFromContent(content: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!content) return files;

  // Format 1: <boltAction type="file" filePath="...">
  const boltRegex = /<boltAction\s+type="file"\s+filePath="([^"]+)">([\s\S]*?)<\/boltAction>/g;
  let match;
  while ((match = boltRegex.exec(content)) !== null) {
    files[match[1]] = decodeHtmlEntities(match[2].trim());
  }

  // Format 2: <file path="...">
  if (Object.keys(files).length === 0) {
    const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
    while ((match = fileRegex.exec(content)) !== null) {
      files[match[1]] = decodeHtmlEntities(match[2].trim());
    }
  }

  return files;
}

/**
 * Parse all actions from content. Supports multiple tag formats.
 */
function parseActionsFromContent(content: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  if (!content) return actions;

  // Try boltAction format first
  const boltRegex = /<boltAction\s+type="(\w+)"(?:\s+filePath="([^"]+)")?>([\s\S]*?)<\/boltAction>/g;
  let match;
  while ((match = boltRegex.exec(content)) !== null) {
    actions.push({
      type: match[1] as "file" | "shell" | "start",
      filePath: match[2] || undefined,
      content: decodeHtmlEntities(match[3].trim()),
    });
  }

  // Fallback: <file path="...">, <shell>, <start>
  if (actions.length === 0) {
    const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
    while ((match = fileRegex.exec(content)) !== null) {
      actions.push({ type: "file", filePath: match[1], content: decodeHtmlEntities(match[2].trim()) });
    }
    const shellRegex = /<shell>([\s\S]*?)<\/shell>/g;
    while ((match = shellRegex.exec(content)) !== null) {
      actions.push({ type: "shell", content: match[1].trim() });
    }
    const startRegex = /<start>([\s\S]*?)<\/start>/g;
    while ((match = startRegex.exec(content)) !== null) {
      actions.push({ type: "start", content: match[1].trim() });
    }
  }

  return actions;
}

interface VibeCodeWorkbenchProps {
  content: string;
  status: "streaming" | "idle";
  metadata: VibeCodeMetadata;
  setMetadata: Dispatch<SetStateAction<VibeCodeMetadata>>;
  isCurrentVersion: boolean;
}

export function VibeCodeWorkbench({
  content,
  status,
  metadata,
  setMetadata,
}: VibeCodeWorkbenchProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "code" | "terminal">("preview");
  const [copied, setCopied] = useState(false);
  const { artifact } = useArtifact();

  // WebContainer requires crossOriginIsolated (not available in cross-origin iframes)
  const canRunWebContainer = typeof window !== "undefined" && window.crossOriginIsolated === true;

  const handleShare = useCallback(() => {
    if (!artifact.documentId || artifact.documentId === "init") return;

    const shareUrl = `${window.location.origin}/share/${artifact.documentId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [artifact.documentId]);

  const metadataFiles = metadata?.files ?? {};
  const previewUrl = metadata?.previewUrl ?? null;
  const terminalOutput = metadata?.terminalOutput ?? "";
  const isBooting = metadata?.isBooting ?? false;


  // Merge: parsed files from saved content as base, metadata files (streaming/edits) override
  const files = useMemo(() => {
    const parsed = parseFilesFromContent(content);
    return { ...parsed, ...metadataFiles };
  }, [metadataFiles, content]);

  const fileEntries = useMemo(() => Object.entries(files), [files]);


  // Auto-replay: when we have saved content but no running preview (after page reload),
  // boot WebContainer and re-execute all actions to restore the live preview.
  const isReplayingRef = useRef(false);

  useEffect(() => {
    console.log("[Workbench:Replay] check:", {
      status,
      hasContent: !!content,
      contentLength: content?.length,
      previewUrl: !!previewUrl,
      isReplaying: isReplayingRef.current,
    });

    // Wait until we have real content and are not streaming
    if (
      status === "streaming" ||
      !content ||
      previewUrl ||
      isReplayingRef.current ||
      !canRunWebContainer
    ) {
      console.log("[Workbench:Replay] SKIP - conditions not met", { canRunWebContainer });
      return;
    }

    const actions = parseActionsFromContent(content);
    console.log("[Workbench:Replay] parsed actions:", actions.length, actions.map(a => `${a.type}:${a.filePath || ''}`));
    if (actions.length === 0) return;

    isReplayingRef.current = true;

    const replay = async () => {
      const runner = new ActionRunner((data) => {
        setMetadata((prev: any) => ({
          ...(prev ?? {}),
          terminalOutput: ((prev as any)?.terminalOutput ?? "") + data,
        }));
      });

      setMetadata((prev: any) => ({
        ...(prev ?? {}),
        isBooting: true,
        actionRunner: runner,
      }));

      const wc = await getWebContainer();

      wc.on("server-ready", (_port: number, url: string) => {
        setMetadata((prev: any) => ({
          ...(prev ?? {}),
          previewUrl: url,
        }));
      });

      setMetadata((prev: any) => ({
        ...(prev ?? {}),
        isBooting: false,
      }));

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const actionId = String(i);
        runner.addAction(actionId, action.type, action.filePath);
        await runner.runAction(actionId, action.type, action.content, action.filePath, false);
      }
    };

    replay().catch((err) => {
      console.error("[VibeCodeWorkbench] Replay failed:", err);
      isReplayingRef.current = false;
      setMetadata((prev: any) => ({
        ...(prev ?? {}),
        isBooting: false,
      }));
    });
  }, [content, status, previewUrl, setMetadata]);

  // Auto-select first file
  useEffect(() => {
    if (!selectedFile && fileEntries.length > 0) {
      setSelectedFile(fileEntries[0][0]);
    }
  }, [fileEntries, selectedFile]);

  const selectedFileContent = selectedFile ? files[selectedFile] ?? "" : "";

  // Rebuild simple-format XML from current files and persist to DB
  const persistToDb = useCallback(async (updatedFiles: Record<string, string>) => {
    const docId = artifact.documentId;
    if (!docId || docId === "init") return;

    // Parse shell/start actions from original content (keep them as-is)
    const shellActions = parseActionsFromContent(content).filter(a => a.type !== "file");

    // Build simple-format XML
    const parts: string[] = ['<project id="vibe" title="Project">'];
    for (const [path, fileContent] of Object.entries(updatedFiles)) {
      parts.push(`  <file path="${path}">${fileContent}</file>`);
    }
    for (const action of shellActions) {
      parts.push(`  <${action.type}>${action.content}</${action.type}>`);
    }
    parts.push("</project>");
    const newXml = parts.join("\n");

    try {
      const { getClientApi } = await import("@/lib/api/clientApi");
      await getClientApi().saveDocument(docId, {
        title: artifact.title,
        content: newXml,
        kind: "vibe-code",
      });
    } catch (err) {
      console.error("[Workbench] Failed to persist to DB:", err);
    }
  }, [artifact.documentId, artifact.title, content]);

  // Write edited file to WebContainer, update local state, and persist to DB
  const handleFileSave = useCallback(async (filePath: string, newContent: string) => {
    try {
      const wc = await getWebContainer();
      const relativePath = filePath.startsWith("/home/project/")
        ? filePath.replace("/home/project/", "")
        : filePath;

      const dir = relativePath.split("/").slice(0, -1).join("/");
      if (dir) {
        try { await wc.fs.mkdir(dir, { recursive: true }); } catch { /* exists */ }
      }

      await wc.fs.writeFile(relativePath, newContent);

      // Update files in metadata so UI reflects the change
      const updatedFiles = { ...files, [filePath]: newContent };
      setMetadata((prev: any) => ({
        ...(prev ?? {}),
        files: { ...(prev?.files ?? {}), [filePath]: newContent },
      }));

      // Persist to DB so changes survive reload
      await persistToDb(updatedFiles);
    } catch (err) {
      console.error("[Workbench] Failed to save file:", err);
    }
  }, [setMetadata, files, persistToDb]);

  if (isBooting) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Booting WebContainer...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Tab bar */}
      <div className="flex border-b bg-muted/30 px-2">
        {(["preview", "code", "terminal"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
        <div className="flex items-center ml-auto pr-2 gap-2">
          {status === "streaming" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating...
            </div>
          )}
          {status !== "streaming" && artifact.documentId && artifact.documentId !== "init" && (
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
              title="Copy share link"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied!
                </>
              ) : (
                <>
                  <Share2 className="h-3 w-3" />
                  Share
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "preview" && (
          canRunWebContainer ? (
            <VibeCodePreview url={previewUrl} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-8">
              <p className="text-sm text-center max-w-md">
                Live preview requires a standalone browser tab. Click below to open the preview.
              </p>
              {artifact.documentId && artifact.documentId !== "init" && (
                <button
                  onClick={() => window.open(`/share/${artifact.documentId}`, "_blank")}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Preview in New Tab
                </button>
              )}
            </div>
          )
        )}

        {activeTab === "code" && (
          <div className="flex h-full">
            {/* File explorer */}
            <div className="w-56 border-r overflow-y-auto bg-muted/20">
              <FileExplorer
                files={fileEntries}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
              />
            </div>
            {/* Code editor */}
            <div className="flex-1 overflow-auto">
              {selectedFile ? (
                <CodeEditor
                  filePath={selectedFile}
                  content={selectedFileContent}
                  onSave={handleFileSave}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Select a file to view
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "terminal" && (
          <VibeCodeTerminal output={terminalOutput} />
        )}
      </div>
    </div>
  );
}
