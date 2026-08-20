"use client";

import {
  CheckCircleIcon,
  CircleIcon,
  LoaderIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { AgentMessage, AgentToolCall } from "@/hooks/use-multi-session";

/**
 * Tool call status indicator within a sub-agent message.
 * Shared between SubAgentMessage and SubAgentChatModal.
 */
export function ToolCallStatus({ toolCall }: { toolCall: AgentToolCall }) {
  const icon =
    toolCall.status === "completed" ? (
      <CheckCircleIcon className="size-3.5 text-green-500" />
    ) : toolCall.status === "running" ? (
      <LoaderIcon className="size-3.5 animate-spin text-blue-500" />
    ) : toolCall.status === "error" ? (
      <XCircleIcon className="size-3.5 text-red-500" />
    ) : (
      <CircleIcon className="size-3.5 text-muted-foreground" />
    );

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      <WrenchIcon className="size-3" />
      <span className="font-mono">{toolCall.name}</span>
    </div>
  );
}

/**
 * Status badge for the sub-agent header.
 * Shared between SubAgentMessage and SubAgentChatModal.
 */
export function StatusBadge({ status }: { status: AgentMessage["status"] }) {
  if (status === "streaming") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <LoaderIcon className="size-2.5 animate-spin" />
        Running
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircleIcon className="size-2.5" />
        Done
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <XCircleIcon className="size-2.5" />
        Error
      </span>
    );
  }
  return null;
}
