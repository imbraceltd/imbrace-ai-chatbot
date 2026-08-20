"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAICentric } from "@/hooks/use-ai-centric";
import { IMBRACE_TOKEN_KEY } from "@/lib/imbrace/constants";
import type { MessageSuggestionContext } from "@/lib/imbrace/types";

type MessageSuggestionProps = {
  bestNextActionUrl: string;
};

export function MessageSuggestion({
  bestNextActionUrl,
}: MessageSuggestionProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const {
    state,
    setMessageSuggestionContext,
    setIsNewChatWithAiCentricInit,
  } = useAICentric();

  const { messageSuggestionContext, isNewChatWithAiCentricInit } = state;

  // Fallback copy function for older browsers or non-HTTPS
  const fallbackCopyTextToClipboard = useCallback((text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    document.execCommand("copy");
    document.body.removeChild(textArea);
  }, []);

  // Function to send contact data to iframe
  const sendContactToIframe = useCallback(
    (context: MessageSuggestionContext) => {
      if (!iframeRef.current || !bestNextActionUrl) {
        return;
      }

      const message = !context.contactId
        ? {
          type: "SCB",
          event: "REMOVE_CONTACT_TO_NEXT_BEST_ACTION",
          data: {},
        }
        : {
          type: "SCB",
          event: "SEND_CONTACT_TO_NEXT_BEST_ACTION",
          data: {
            contactId: context.contactId,
            contactName: context.contactName ?? "",
            boardId: context.boardId,
            boardItemId: context.boardItemId,
            conversationId: context.conversationId,
          },
        };

      iframeRef.current.contentWindow?.postMessage(message, bestNextActionUrl);
    },
    [bestNextActionUrl]
  );

  // Send contact when context changes
  useEffect(() => {
    if (messageSuggestionContext) {
      sendContactToIframe(messageSuggestionContext);
    }
  }, [messageSuggestionContext, sendContactToIframe]);

  // Handle new chat with AICentric init
  useEffect(() => {
    if (isNewChatWithAiCentricInit && !messageSuggestionContext.contactId) {
      const message = {
        type: "SCB",
        event: "GET_CONTACT_FROM_NEXT_BEST_ACTION",
        data: {},
      };
      iframeRef.current?.contentWindow?.postMessage(message, bestNextActionUrl);
      setIsNewChatWithAiCentricInit(false);
    }
  }, [
    isNewChatWithAiCentricInit,
    messageSuggestionContext.contactId,
    bestNextActionUrl,
    setIsNewChatWithAiCentricInit,
  ]);

  // Handle messages from iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Only accept messages from our iframe origin
      if (event.origin !== bestNextActionUrl) {
        return;
      }

      const { type, event: eventType, data } = event.data;

      // Check for SCB type with CONTACT_SELECTED event
      if (
        type === "SCB" &&
        eventType === "CONTACT_SELECTED" &&
        data?.contactId
      ) {
        // Update context with selected contact
        setMessageSuggestionContext({
          contactId: data.contactId,
          contactName: data.contactName ?? "",
          boardId: data.boardId,
          boardItemId: data.boardItemId,
          conversationId: data.conversationId,
        });
      }

      // Handle CHILD_READY event
      if (eventType === "CHILD_READY") {
        if (messageSuggestionContext.contactId) {
          sendContactToIframe(messageSuggestionContext);
        } else {
          const message = {
            type: "SCB",
            event: "GET_CONTACT_FROM_NEXT_BEST_ACTION",
            data: {},
          };
          iframeRef.current?.contentWindow?.postMessage(
            message,
            bestNextActionUrl
          );
        }
      }

      // Handle CONTACT_COPIED event
      if (eventType === "CONTACT_COPIED") {
        // Copy data to clipboard
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(data.contactUrl).catch(() => {
            // Fallback to old method
            fallbackCopyTextToClipboard(data.contactUrl);
          });
        } else {
          // Fallback for older browsers or non-HTTPS
          fallbackCopyTextToClipboard(data.contactUrl);
        }
      }
    },
    [
      bestNextActionUrl,
      messageSuggestionContext,
      sendContactToIframe,
      setMessageSuggestionContext,
      fallbackCopyTextToClipboard,
    ]
  );

  useEffect(() => {
    // Add message listener
    window.addEventListener("message", handleMessage);

    return () => {
      // Clean up message listener
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  // Send initial message to iframe when it loads
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      if (messageSuggestionContext.contactId) {
        sendContactToIframe(messageSuggestionContext);
      }
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
      iframe.removeEventListener("load", handleLoad);
    };
  }, [messageSuggestionContext, sendContactToIframe]);

  const imbraceToken =
    typeof window !== "undefined"
      ? localStorage.getItem(IMBRACE_TOKEN_KEY)
      : null;

  if (!bestNextActionUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-50 dark:bg-gray-800">
        <div className="text-center">
          <div className="text-lg text-gray-500 dark:text-gray-400">
            Best Next Action
          </div>
          <div className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            URL not configured
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <iframe
        ref={iframeRef}
        className="h-full w-full border-none"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        src={`${bestNextActionUrl}/suggested-messages?token=${imbraceToken}`}
        title="Message Suggestions"
      />
    </div>
  );
}







