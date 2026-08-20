"use client";

import { Artifact } from "@/components/create-artifact";
import { VibeCodeWorkbench } from "@/components/vibe-code/workbench";
import { ActionRunner } from "@/lib/webcontainer/action-runner";
import { getWebContainer } from "@/lib/webcontainer";

export type VibeCodeFile = {
  path: string;
  content: string;
};

export type VibeCodeMetadata = {
  files: Record<string, string>;
  terminalOutput: string;
  previewUrl: string | null;
  isBooting: boolean;
  actionRunner: ActionRunner | null;
};

const initialMetadata: VibeCodeMetadata = {
  files: {},
  terminalOutput: "",
  previewUrl: null,
  isBooting: false,
  actionRunner: null,
};

export const vibeCodeArtifact = new Artifact<"vibe-code", VibeCodeMetadata>({
  kind: "vibe-code",
  description: "Full web applications with live preview powered by WebContainer",

  initialize: ({ setMetadata }) => {
    const canRun = typeof window !== "undefined" && window.crossOriginIsolated === true;

    const runner = new ActionRunner((data) => {
      setMetadata((prev) => {
        const current = prev ?? initialMetadata;
        return {
          ...current,
          terminalOutput: current.terminalOutput + data,
        };
      });
    });

    setMetadata({
      ...initialMetadata,
      actionRunner: runner,
      isBooting: canRun,
    });

    if (!canRun) {
      console.warn("[VibeCode] crossOriginIsolated is false — WebContainer disabled. Use /share/ page for preview.");
      return;
    }

    // Boot WebContainer in background
    getWebContainer().then((wc) => {
      wc.on("server-ready", (_port: number, url: string) => {
        setMetadata((prev) => ({
          ...(prev ?? initialMetadata),
          previewUrl: url,
        }));
      });

      setMetadata((prev) => ({
        ...(prev ?? initialMetadata),
        isBooting: false,
      }));
    });
  },

  onStreamPart: ({ streamPart, setArtifact, setMetadata }) => {
    if (streamPart.type !== "data-vibeCodeDelta") return;

    const data = streamPart.data as {
      action: string;
      actionId?: string;
      actionType?: string;
      artifactId?: string;
      filePath?: string;
      content?: string;
      title?: string;
      chatId?: string;
    };

    const { action, actionId, actionType, filePath, content } = data;

    setMetadata((prev) => {
      const current = prev ?? initialMetadata;
      const runner = current.actionRunner;
      if (!runner) return current;

      switch (action) {
        case "artifact-open": {
          return current;
        }

        case "action-open": {
          if (actionId && actionType) {
            runner.addAction(
              actionId,
              actionType as "file" | "shell" | "start",
              filePath,
            );
          }
          return current;
        }

        case "action-stream": {
          // Streaming file content — write to WebContainer if available, always update metadata
          if (actionType === "file" && filePath && content && actionId) {
            const canRun = typeof window !== "undefined" && window.crossOriginIsolated === true;
            if (canRun) {
              runner.runAction(actionId, "file", content, filePath, true);
            }
            return { ...current, files: { ...current.files, [filePath]: content } };
          }
          return current;
        }

        case "action-close": {
          if (!actionId || !actionType) return current;
          const canRun = typeof window !== "undefined" && window.crossOriginIsolated === true;

          if (actionType === "file" && filePath && content) {
            if (canRun) {
              runner.runAction(actionId, "file", content, filePath, false);
            }
            return { ...current, files: { ...current.files, [filePath]: content } };
          }

          if (canRun && actionType === "shell" && content) {
            runner.runAction(actionId, "shell", content);
          }

          if (canRun && actionType === "start" && content) {
            runner.runAction(actionId, "start", content);
          }

          return current;
        }

        case "artifact-close": {
          return current;
        }

        default:
          return current;
      }
    });

    // Make artifact visible once we start receiving data
    setArtifact((prev) => ({
      ...prev,
      status: "streaming",
      isVisible: true,
    }));
  },

  content: ({
    content,
    status,
    metadata,
    setMetadata,
    isCurrentVersion,
  }) => (
    <VibeCodeWorkbench
      content={content}
      status={status}
      metadata={metadata}
      setMetadata={setMetadata}
      isCurrentVersion={isCurrentVersion}
    />
  ),

  actions: [],
  toolbar: [],
});
