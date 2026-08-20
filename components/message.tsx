"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import equal from "fast-deep-equal";
import { motion } from "framer-motion";
import { memo, useEffect, useState } from "react";
import type { AgentMessage, SubAgentSessionInfo } from "@/hooks/use-multi-session";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { SubAgentMessage } from "./sub-agent-message";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { CodeBlock } from "./elements/code-block";
import { MessageContent } from "./elements/message";
import { QuestionChoices } from "./elements/question-choices";
import { Response } from "./elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./elements/tool";
import { ToolApproval } from "./elements/tool-approval";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { Weather } from "./weather";
import { useAICentric } from "@/hooks/use-ai-centric";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractEchartToolContextFromOutput(output: unknown): {
  chatId: string;
  chartId: string;
  chartData: unknown;
} | null {
  if (!isRecord(output)) {
    return null;
  }

  const threadId = output.thread_id;
  const chartId = output.echart_id;
  const chartData = output.echart;

  if (
    typeof threadId !== "string" ||
    typeof chartId !== "string" ||
    chartData === undefined
  ) {
    return null;
  }

  return { chatId: threadId, chartId, chartData };
}

/**
 * Sanitize a name to match the server's tool name format.
 * Must match the sanitizeToolName() in sub-agent-tool.ts.
 */
function toToolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Wrapper around Tool that auto-opens when hasResult becomes true */
function AutoOpenTool({
  hasResult,
  children,
  ...props
}: { hasResult: boolean } & React.ComponentProps<typeof Tool>) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasResult) {
      setOpen(true);
    }
  }, [hasResult]);

  return (
    <Tool {...props} open={open} onOpenChange={setOpen}>
      {children}
    </Tool>
  );
}

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  sendMessage,
  regenerate,
  addToolApprovalResponse,
  isReadonly,
  requiresScrollPadding,
  agentMessages = [],
  parentChatId,
  subAgentSessions,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  /** Resolves a paused tool call (server-side needsApproval). When omitted,
   * approval UI is hidden. */
  addToolApprovalResponse?: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  agentMessages?: AgentMessage[];
  /** Parent chat ID for sub-agent session continuation */
  parentChatId?: string;
  /** Sub-agent session registry from Chat.lastContext */
  subAgentSessions?: SubAgentSessionInfo[];
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const { setChartContext } = useAICentric();
  const echartId = message.metadata?.echartId;

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  /**
   * Extract the chart context from the message parts and set the chart context in the AICentric state.
   */
  useEffect(() => {
    // Skip if echartId is already set - prevents repeated API calls
    if (echartId) {
      return;
    }

    const parts = message.parts;

    // Try UI streaming format first: parts with type "tool-createEchart"
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (typeof part.type !== "string" || !part.type.startsWith("tool-")) {
        continue;
      }

      const toolName = part.type.slice("tool-".length);
      if (toolName !== "Echart") {
        continue;
      }

      if (!("state" in part) || part.state !== "output-available") {
        continue;
      }

      if (!("output" in part)) {
        continue;
      }

      const context = extractEchartToolContextFromOutput(part.output);
      if (context) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? {
                ...m,
                metadata: {
                  ...(m.metadata ?? { createdAt: new Date().toISOString() }),
                  echartId: context.chartId,
                },
              }
              : m
          )
        );
        setChartContext({
          chatId: context.chatId,
          chartId: context.chartId,
          chartData: context.chartData,
        });
        return;
      }
    }

    // Fallback: DB format - find tool-call for createEchart + its matching tool-result
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as Record<string, unknown>;
      if (part.type === "tool-call" && part.toolName === "Echart") {
        const toolCallId = part.toolCallId;
        // Find matching tool-result
        const resultPart = parts.find(
          (p) => (p as Record<string, unknown>).type === "tool-result" && (p as Record<string, unknown>).toolCallId === toolCallId
        ) as Record<string, unknown> | undefined;
        if (resultPart?.result) {
          const context = extractEchartToolContextFromOutput(resultPart.result);
          if (context) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === message.id
                  ? {
                    ...m,
                    metadata: {
                      ...(m.metadata ?? { createdAt: new Date().toISOString() }),
                      echartId: context.chartId,
                    },
                  }
                  : m
              )
            );
            setChartContext({
              chatId: context.chatId,
              chartId: context.chartId,
              chartData: context.chartData,
            });
            return;
          }
        }
      }
    }
  }, [message.id, message.metadata?.echartId, message.parts, setChartContext, setMessages]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="group/message w-full"
      data-role={message.role}
      data-testid={`message-${message.role}`}
      initial={{ opacity: 0 }}
    >
      <div
        className={cn("flex w-full items-start gap-2 md:gap-3", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
        })}
      >
        {message.role === "assistant" && (
          <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div
          className={cn("flex flex-col", {
            "items-end": message.role === "user" && mode !== "edit",
            "gap-2 md:gap-4": message.parts?.some(
              (p) => p.type === "text" && p.text?.trim()
            ),
            "min-h-96": message.role === "assistant" && requiresScrollPadding,
            "w-full":
              (message.role === "assistant" &&
                message.parts?.some(
                  (p) => p.type === "text" && p.text?.trim()
                )) ||
              mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex flex-row justify-end gap-2"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment, idx) => {
                // File parts may have `url` or `data` depending on source format
                const fileUrl = attachment.url || (attachment as any).data || "";
                return (
                  <PreviewAttachment
                    attachment={{
                      name:
                        attachment.filename ??
                        (typeof fileUrl === "string" &&
                          fileUrl.trim().length > 0
                          ? fileUrl
                          : "file"),
                      contentType: attachment.mediaType,
                      url: fileUrl,
                    }}
                    key={fileUrl || idx}
                  />
                );
              })}
            </div>
          )}

          {(message.parts ?? []).map((() => {
            // Track consumed agent IDs across parts to prevent duplicate sub-agent rendering
            const consumedAgentIds = new Set<string>();
            return (part: any, index: number) => {
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === "reasoning" && part.text?.trim().length > 0) {
              return (
                <MessageReasoning
                  isLoading={isLoading}
                  key={key}
                  reasoning={part.text}
                />
              );
            }

            if (type === "text") {
              if (mode === "view") {
                return (
                  <div key={key}>
                    <MessageContent
                      className={cn({
                        "w-fit break-words rounded-2xl px-3 py-2 text-left text-white":
                          message.role === "user",
                        "bg-transparent px-0 py-0 text-left":
                          message.role === "assistant",
                      })}
                      data-testid="message-content"
                      style={
                        message.role === "user"
                          ? { backgroundColor: "#006cff" }
                          : undefined
                      }
                    >
                      <Response>{sanitizeText(part.text)}</Response>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        regenerate={regenerate}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (type === "tool-createDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error creating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <DocumentPreview
                  chatId={chatId}
                  isReadonly={isReadonly}
                  key={toolCallId}
                  result={part.output}
                />
              );
            }

            if (type === "tool-updateDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error updating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <div className="relative" key={toolCallId}>
                  <DocumentPreview
                    chatId={chatId}
                    args={{ ...part.output, isUpdate: true }}
                    isReadonly={isReadonly}
                    result={part.output}
                  />
                </div>
              );
            }

            if (typeof type === "string" && type.startsWith("tool-")) {
              // Extract the tool name from the type (e.g. "tool-city_weather_agent" → "city_weather_agent")
              const toolNameFromType = type.slice("tool-".length);

              // Check if this tool call corresponds to a sub-agent
              // Use consumedAgentIds to prevent the same agent from matching multiple tool-call parts
              let matchingAgent = agentMessages.find(
                (am) => !consumedAgentIds.has(am.id) && toToolName(am.agentName) === toolNameFromType,
              );

              // For "task" tool calls, match by input.subagent_type
              if (!matchingAgent && toolNameFromType === "task") {
                const input = (part as Record<string, unknown>).input as Record<string, unknown> | undefined;
                const subagentType = typeof input?.subagent_type === "string" ? input.subagent_type : undefined;
                if (subagentType) {
                  matchingAgent = agentMessages.find(
                    (am) => !consumedAgentIds.has(am.id) && toToolName(am.agentName) === subagentType,
                  );
                }
                // Fallback: match next available agent by order
                if (!matchingAgent && agentMessages.length > 0) {
                  matchingAgent = agentMessages.find((am) => !consumedAgentIds.has(am.id));
                }
              }

              if (matchingAgent) {
                consumedAgentIds.add(matchingAgent.id);
                // Reason: Find existing session for this sub-agent so the
                // expand modal can reuse it instead of creating a new one.
                const existingSession = subAgentSessions?.find(
                  (s) => s.assistantId === matchingAgent!.assistantId,
                );
                return (
                  <SubAgentMessage
                    key={matchingAgent.id}
                    message={matchingAgent}
                    parentChatId={parentChatId}
                    existingSessionId={existingSession?.sessionId}
                  />
                );
              }

              if (!("toolCallId" in part) || !("state" in part)) {
                return null;
              }

              const toolPart = part as unknown as ToolUIPart;
              const { toolCallId, state } = toolPart;

              // Extract markdown result from tool output (duckdb_query, RAGknowledge, etc.)
              const markdownResult =
                state === "output-available" &&
                  isRecord(toolPart.output) &&
                  typeof (toolPart.output as Record<string, unknown>).result === "string"
                  ? ((toolPart.output as Record<string, unknown>).result as string)
                  : null;

              const staticToolName = toolNameFromType;
              const staticApprovalId =
                state === "approval-requested" &&
                (toolPart as { approval?: { id: string } }).approval?.id;
              const showApprovalForStatic =
                !isReadonly &&
                !!staticApprovalId &&
                !!addToolApprovalResponse;

              return (
                <AutoOpenTool hasResult={!!markdownResult} key={toolCallId}>
                  <ToolHeader input={toolPart.input} state={state} type={type} />
                  {markdownResult ? (
                    <ToolContent>
                      <div className="p-4">
                        <Response>{markdownResult}</Response>
                      </div>
                    </ToolContent>
                  ) : null}
                  {showApprovalForStatic && (
                    <ToolApproval
                      input={toolPart.input}
                      onDecision={(approved) => {
                        void addToolApprovalResponse({
                          id: staticApprovalId,
                          approved,
                        });
                      }}
                      toolName={staticToolName}
                    />
                  )}
                </AutoOpenTool>
              );
            }

            if (type === "dynamic-tool") {
              const dynamicPart = part as unknown as DynamicToolUIPart;
              const { toolCallId, toolName, state } = dynamicPart;

              // Extract markdown result from tool output (duckdb_query, RAGknowledge, etc.)
              const markdownResult =
                state === "output-available" &&
                  isRecord(dynamicPart.output) &&
                  typeof (dynamicPart.output as Record<string, unknown>).result === "string"
                  ? ((dynamicPart.output as Record<string, unknown>).result as string)
                  : null;

              const dynamicApprovalId =
                state === "approval-requested" &&
                (dynamicPart as { approval?: { id: string } }).approval?.id;
              const showApprovalForDynamic =
                !isReadonly &&
                !!dynamicApprovalId &&
                !!addToolApprovalResponse;

              return (
                <AutoOpenTool hasResult={!!markdownResult} key={toolCallId}>
                  <ToolHeader input={dynamicPart.input} state={state} type={`tool-${toolName}`} />
                  {markdownResult ? (
                    <ToolContent>
                      <div className="p-4">
                        <Response>{markdownResult}</Response>
                      </div>
                    </ToolContent>
                  ) : null}
                  {showApprovalForDynamic && (
                    <ToolApproval
                      input={dynamicPart.input}
                      onDecision={(approved) => {
                        void addToolApprovalResponse({
                          id: dynamicApprovalId,
                          approved,
                        });
                      }}
                      toolName={toolName}
                    />
                  )}
                </AutoOpenTool>
              );
            }

            return null;
          }; })())}

          {mode === "view" && message.metadata?.createdAt && (
            <div
              className={cn("mt-1 flex", {
                "justify-end": message.role === "user",
                "justify-start": message.role === "assistant",
              })}
            >
              <span className="text-muted-foreground text-[11px]">
                {new Date(message.metadata.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}

          {echartId && mode === "view" && (
            <div
              className={cn("mt-1 flex", {
                "justify-end": message.role === "user",
                "justify-start": message.role === "assistant",
              })}
            >
              <button
                className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
                onClick={() => {
                  setChartContext({ chatId: chatId, chartId: echartId, chartData: undefined });
                }}
                type="button"
              >
                See Chart
              </button>
            </div>
          )}

          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    // During streaming, upstream libraries may mutate message parts in-place.
    // `fast-deep-equal` short-circuits on reference equality, which would prevent
    // re-renders and make the UI appear "stuck" until the stream finishes.
    if (prevProps.isLoading || nextProps.isLoading) {
      return false;
    }

    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.message.id !== nextProps.message.id) {
      return false;
    }
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding) {
      return false;
    }
    if (!equal(prevProps.message.parts, nextProps.message.parts)) {
      return false;
    }
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }
    if (!equal(prevProps.agentMessages, nextProps.agentMessages)) {
      return false;
    }

    return true;
  }
);

export const ThinkingMessage = () => {
  const role = "assistant";

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="group/message w-full"
      data-role={role}
      data-testid="message-assistant-loading"
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-start gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="p-0 text-muted-foreground text-sm">
            Thinking...
          </div>
        </div>
      </div>
    </motion.div>
  );
};

