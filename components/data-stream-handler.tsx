"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { initialArtifactData, useArtifact } from "@/hooks/use-artifact";
import { useChatHistoryStore } from "@/hooks/use-chat-history-store";
import { artifactDefinitions } from "./artifact";
import { useDataStream } from "./data-stream-provider";

function readStreamChatId(delta: unknown): string | undefined {
  if (typeof delta !== "object" || delta === null) {
    return undefined;
  }

  // New format: chatId lives inside `data` object.
  if ("data" in delta) {
    const data = (delta as { data?: unknown }).data;
    if (typeof data === "object" && data !== null && "chatId" in data) {
      const chatId = (data as { chatId?: unknown }).chatId;
      if (typeof chatId === "string") {
        return chatId;
      }
    }
  }

  // Backward compat: chatId at the top-level.
  if ("chatId" in delta) {
    const chatId = (delta as { chatId?: unknown }).chatId;
    if (typeof chatId === "string") {
      return chatId;
    }
  }

  return undefined;
}

function readStreamValue<T>(data: unknown): T {
  if (typeof data === "object" && data !== null && "value" in data) {
    return (data as { value: T }).value;
  }
  return data as T;
}

export function DataStreamHandler({ chatId }: { chatId: string }) {
  const { dataStream, setDataStream } = useDataStream();
  const { refresh: refreshChatHistory } = useChatHistoryStore();
  const processedIndexRef = useRef(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const lastPersistedSignalRef = useRef(0);

  const { artifact, setArtifact, setMetadata } = useArtifact();
  const { mutate } = useSWRConfig();

  // Keep a ref to read current artifact at persist time without adding to effect deps.
  const artifactRef = useRef(artifact);
  artifactRef.current = artifact;

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    // If the stream buffer shrinks (e.g. new chat clears the buffer), clamp the processed index.
    processedIndexRef.current = Math.min(processedIndexRef.current, dataStream.length);

    // Consume only the new parts since the last render to avoid races with
    // concurrent appends (e.g. dropping a trailing "data-finish").
    const startIndex = processedIndexRef.current;
    if (startIndex >= dataStream.length) {
      return;
    }

    const newDeltas = dataStream.slice(startIndex);
    processedIndexRef.current = dataStream.length;

    // Prevent unbounded growth. Keep a small tail; adjust processed index accordingly.
    const maxBufferedParts = 200;
    if (dataStream.length > maxBufferedParts) {
      const keepFrom = Math.max(0, dataStream.length - maxBufferedParts);
      setDataStream(dataStream.slice(keepFrom));
      processedIndexRef.current = Math.max(0, processedIndexRef.current - keepFrom);
    }

    for (const delta of newDeltas) {
      const deltaChatId = readStreamChatId(delta);
      if (deltaChatId && deltaChatId !== chatId) {
        continue;
      }

      // Handle chat title updates (e.g. server streams "data-chat-title")
      if (delta.type === "data-chat-title") {
        void refreshChatHistory();
        continue;
      }

      const artifactDefinition = artifactDefinitions.find(
        (currentArtifactDefinition) =>
          currentArtifactDefinition.kind === artifact.kind
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return {
            ...initialArtifactData,
            chatId: deltaChatId,
            status: "streaming",
          };
        }

        switch (delta.type) {
          case "data-id":
            return {
              ...draftArtifact,
              chatId: deltaChatId ?? draftArtifact.chatId,
              documentId: readStreamValue<string>(delta.data),
              status: "streaming",
            };

          case "data-title":
            return {
              ...draftArtifact,
              chatId: deltaChatId ?? draftArtifact.chatId,
              title: readStreamValue<string>(delta.data),
              status: "streaming",
            };

          case "data-kind":
            return {
              ...draftArtifact,
              chatId: deltaChatId ?? draftArtifact.chatId,
              kind: readStreamValue<typeof draftArtifact.kind>(delta.data),
              status: "streaming",
            };

          case "data-clear":
            return {
              ...draftArtifact,
              chatId: deltaChatId ?? draftArtifact.chatId,
              content: "",
              status: "streaming",
            };

          case "data-finish":
            // Signal that we should persist the artifact content to our DB.
            // This is needed because upstream streaming (e.g. Imbrace) may emit
            // data-id/title/kind/content but doesn't necessarily write to our local DB.
            setFinishSignal((current) => current + 1);
            return {
              ...draftArtifact,
              chatId: deltaChatId ?? draftArtifact.chatId,
              status: "idle",
            };

          default:
            return draftArtifact;
        }
      });
    }
  }, [
    dataStream,
    setDataStream,
    setArtifact,
    setMetadata,
    artifact.kind,
    refreshChatHistory,
    chatId,
  ]);

  // Persist document to our DB when a stream completes.
  // This makes `/api/document?id=...` work even if the stream came from an external service.
  // IMPORTANT: Only depend on finishSignal to avoid POST spam during streaming.
  useEffect(() => {
    // Only persist when finishSignal transitions to a new non-zero value.
    if (finishSignal === 0 || finishSignal === lastPersistedSignalRef.current) {
      return;
    }

    const currentArtifact = artifactRef.current;
    if (currentArtifact.documentId === "init") {
      return;
    }

    // For vibe-code: server already saved the document with full content.
    // Don't POST (artifact.content is "" due to data-clear). Instead, re-fetch
    // from server so artifact.content gets the saved content.
    if (currentArtifact.kind === "vibe-code") {
      lastPersistedSignalRef.current = finishSignal;
      void mutate(`/api/document?id=${currentArtifact.documentId}`);
      return;
    }

    // Mark as persisted before async call to prevent double-persist in StrictMode.
    lastPersistedSignalRef.current = finishSignal;

    import("@/lib/api/clientApi").then(({ getClientApi }) => {
      getClientApi().saveDocument(currentArtifact.documentId, {
        title: currentArtifact.title,
        content: currentArtifact.content,
        kind: currentArtifact.kind,
      }).catch(() => {
        // ignore - artifact still works locally; persistence failure is non-fatal
      });
    });
  }, [finishSignal]);

  return null;
}
