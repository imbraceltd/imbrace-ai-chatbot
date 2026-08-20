"use client";

/**
 * Hook to track chat processing status via SSE.
 * When a chat is in "processing" state (e.g., after page reload during streaming),
 * opens an SSE connection to listen for status changes.
 * Calls onComplete when processing finishes so the UI can fetch updated messages.
 */

import { useEffect, useRef, useState } from "react";

interface UseChatProcessingStatusOptions {
  chatId: string;
  initialStatus: "idle" | "processing";
  onComplete?: () => void;
}

interface UseChatProcessingStatusResult {
  isProcessing: boolean;
}

/**
 * Subscribe to chat processing status via SSE.
 * @param options - chatId, initialStatus, and onComplete callback
 * @returns Object with isProcessing boolean
 */
export function useChatProcessingStatus({
  chatId,
  initialStatus,
  onComplete,
}: UseChatProcessingStatusOptions): UseChatProcessingStatusResult {
  const [isProcessing, setIsProcessing] = useState(
    initialStatus === "processing",
  );
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (initialStatus !== "processing") {
      return;
    }

    const eventSource = new EventSource(
      `/api/chat-status/${chatId}`,
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { status: string };
        if (data.status === "idle") {
          setIsProcessing(false);
          eventSource.close();
          onCompleteRef.current?.();
        }
      } catch {
        // Ignore malformed SSE data
      }
    };

    eventSource.onerror = () => {
      // Reason: On error (e.g., network issue), close and stop showing processing.
      // The user can manually refresh if needed.
      setIsProcessing(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [chatId, initialStatus]);

  return { isProcessing };
}
