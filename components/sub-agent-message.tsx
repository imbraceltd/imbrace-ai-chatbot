"use client";

import { memo, useState } from "react";
import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderIcon,
  Maximize2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Response } from "./elements/response";
import type { AgentMessage } from "@/hooks/use-multi-session";
import { ToolCallStatus, StatusBadge } from "./sub-agent-shared";
import { SubAgentChatModal } from "./sub-agent-chat-modal";

/**
 * SubAgentMessage renders a single sub-agent's message block.
 * Clickable collapsible panel that shows real-time sub-agent progress.
 * When streaming, auto-expands. User can click to collapse/expand.
 * Includes a maximize button to open fullscreen chat modal.
 */
export const SubAgentMessage = memo(function SubAgentMessage({
  message,
  parentChatId,
  existingSessionId,
}: {
  message: AgentMessage;
  /** Parent chat ID for sub-agent session continuation */
  parentChatId?: string;
  /** Existing session ID from Chat.lastContext.subAgentSessions */
  existingSessionId?: string;
}) {
  const isStreaming = message.status === "streaming";
  const [isExpanded, setIsExpanded] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const toolsCompleted = message.toolCalls.filter(
    (tc) => tc.status === "completed",
  ).length;
  const toolsTotal = message.toolCalls.length;

  return (
    <>
      <div
        className={cn(
          "mx-1 overflow-hidden rounded-lg border transition-all duration-200",
          isStreaming
            ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20"
            : message.status === "error"
              ? "border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20"
              : "border-border bg-muted/20",
        )}
      >
        {/* Clickable header */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
            "hover:bg-muted/40",
          )}
        >
          {/* Agent icon */}
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full",
              isStreaming
                ? "bg-blue-100 dark:bg-blue-900/40"
                : message.status === "error"
                  ? "bg-red-100 dark:bg-red-900/40"
                  : "bg-green-100 dark:bg-green-900/40",
            )}
          >
            <BotIcon
              className={cn(
                "size-3.5",
                isStreaming
                  ? "text-blue-600 dark:text-blue-400"
                  : message.status === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400",
              )}
            />
          </div>

          {/* Agent name + status */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-sm font-medium truncate">
              {message.agentName}
            </span>
            <StatusBadge status={message.status} />
            {toolsTotal > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {toolsCompleted}/{toolsTotal} tools
              </span>
            )}
          </div>

          {/* Open fullscreen chat modal */}
          {!isStreaming && message.assistantId && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setModalOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setModalOpen(true);
                }
              }}
              className="rounded p-1 hover:bg-muted/60"
              title="Open fullscreen chat"
            >
              <Maximize2Icon className="size-3.5 text-muted-foreground" />
            </div>
          )}

          {/* Expand/collapse chevron */}
          {isExpanded ? (
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        {/* Expandable content */}
        {isExpanded && (
          <div className="border-t border-border/50 px-3 py-2.5">
            {/* Tool calls */}
            {message.toolCalls.length > 0 && (
              <div className="mb-2 flex flex-col gap-1 rounded-md bg-background/60 px-3 py-2">
                {message.toolCalls.map((tc, idx) => (
                  <ToolCallStatus
                    key={tc.toolCallId || `${tc.name}-${idx}`}
                    toolCall={tc}
                  />
                ))}
              </div>
            )}

            {/* Streaming text */}
            {message.text ? (
              <div className="text-sm">
                <Response>{message.text}</Response>
              </div>
            ) : isStreaming ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderIcon className="size-3 animate-spin" />
                <span>Waiting for response...</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Fullscreen chat modal */}
      <SubAgentChatModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        agentMessage={message}
        parentChatId={parentChatId}
        existingSessionId={existingSessionId}
      />
    </>
  );
});
