"use client";

import { memo, useEffect, useState } from "react";
import { IMBRACE_TOKEN_KEY, IMBRACE_ORG_ID_KEY } from "@/lib/imbrace/constants";
import { getPromptSuggestions } from "@/lib/imbrace/api";
import { cn } from "@/lib/utils";

type PromptSuggestionsProps = {
  assistantId: string | null | undefined;
  onSuggestionClick: (message: string) => void;
  disabled?: boolean;
};

function PurePromptSuggestions({
  assistantId,
  onSuggestionClick,
  disabled = false,
}: PromptSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!assistantId) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setSuggestions([]);

      try {
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem(IMBRACE_TOKEN_KEY)
            : null;

        if (!token) {
          return;
        }

        const organizationId =
          typeof window !== "undefined"
            ? localStorage.getItem(IMBRACE_ORG_ID_KEY) ?? ""
            : "";

        const isJwt = token.startsWith("eyJ");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-access-token": token,
        };
        if (isJwt) headers["Authorization"] = `Bearer ${token}`;
        if (organizationId) headers["x-organization-id"] = organizationId;

        const response = await fetch(
          `${getPromptSuggestions.api}?assistant_id=${encodeURIComponent(assistantId)}`,
          {
            method: getPromptSuggestions.method,
            headers,
          }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.data)) {
          setSuggestions(data.data);
        }
      } catch {
        // Silently ignore errors
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSuggestions();
  }, [assistantId]);

  if (!assistantId || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <div
        className={cn(
          "flex gap-2 overflow-x-auto pb-1",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {suggestions.map((suggestion, index) => (
          <button
            className={cn(
              "shrink-0 whitespace-nowrap rounded-lg border border-border",
              "bg-muted/40 px-3 py-2 text-sm text-foreground",
              "transition-colors hover:bg-muted/70",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            disabled={disabled || isLoading}
            key={`${suggestion}-${index}`}
            onClick={() => {
              onSuggestionClick(suggestion);
            }}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export const PromptSuggestions = memo(
  PurePromptSuggestions,
  (prevProps, nextProps) => {
    if (prevProps.assistantId !== nextProps.assistantId) {
      return false;
    }
    if (prevProps.disabled !== nextProps.disabled) {
      return false;
    }
    return true;
  }
);
