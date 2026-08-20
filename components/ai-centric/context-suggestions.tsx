"use client";

import { useMemo } from "react";
import { useAICentric } from "@/hooks/use-ai-centric";
import type { MessageSuggestionContext } from "@/lib/imbrace/types";

type AiCentricContextSuggestionsProps = {
  onSuggestionClick: (message: string) => void;
};

function resetMessageSuggestionContext(): MessageSuggestionContext {
  return {
    contactId: null,
    contactName: "",
    boardId: undefined,
    boardItemId: undefined,
    conversationId: undefined,
  };
}

export function AiCentricContextSuggestions({
  onSuggestionClick,
}: AiCentricContextSuggestionsProps) {
  const { state, isSCBAgent, setMessageSuggestionContext } = useAICentric();
  const context = state.messageSuggestionContext;

  const suggestedMessages = useMemo(() => {
    const name = context.contactName || "this contact";
    return [
      `Give me the summary of customer ${name}?`,
      `What product you will recommend me to show to customer ${name}?`,
      "Give me the top 10 product data on Bond List ?",
      `Show me profile of customer ${name}?`,
    ];
  }, [context.contactName]);

  if (!isSCBAgent || !context.contactId) {
    return null;
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          You can ask anything about
        </span>
        <div className="inline-flex items-center gap-2 rounded px-3 py-1.5 text-white" style={{ backgroundColor: "#3399FC" }}>
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <title>Company</title>
            <path
              clipRule="evenodd"
              d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-6a1 1 0 00-1-1H9a1 1 0 00-1 1v6a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z"
              fillRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium">
            {context.contactName || "Company"}
          </span>
          <button
            className="ml-1 rounded-full p-0.5 transition-colors hover:bg-white/20"
            onClick={() => {
              setMessageSuggestionContext(resetMessageSuggestionContext());
            }}
            type="button"
          >
            <span className="sr-only">Clear</span>
            <svg
              aria-hidden="true"
              className="h-3 w-3"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <title>Clear</title>
              <path
                clipRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                fillRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        <div className="flex min-w-0 flex-1 gap-2">
          {suggestedMessages.map((message) => (
            <button
              className="flex shrink-0 whitespace-nowrap rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground hover:bg-muted/70"
              key={message}
              onClick={() => {
                // biome-ignore lint/suspicious/noConsole: requested debug logs
                console.debug("[DEBUG-AICENTRIC]", "Suggested message clicked", {
                  message,
                });

                onSuggestionClick(message);

                // Best-effort focus the chat textarea
                setTimeout(() => {
                  const textarea = document.querySelector(
                    'textarea[name="message"]'
                  ) as HTMLTextAreaElement | null;
                  textarea?.focus();
                }, 0);
              }}
              type="button"
            >
              {message}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}






