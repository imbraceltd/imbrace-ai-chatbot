import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { AnimatePresence } from "framer-motion";
import { ArrowDownIcon } from "lucide-react";
import { memo, useEffect, useMemo } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { AgentMessage, SubAgentSessionInfo } from "@/hooks/use-multi-session";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { useDataStream } from "./data-stream-provider";
import { Conversation, ConversationContent } from "./elements/conversation";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";

/**
 * Sanitize a name to match the server's tool name format.
 * Must match sanitizeToolName() in sub-agent-tool.ts and toToolName() in message.tsx.
 */
function toToolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Build a per-message mapping of agent messages using order-based consumption.
 * When multiple messages invoke the same sub-agent (e.g., "City Weather Agent"),
 * the Nth tool call of that name is matched to the Nth AgentMessage with that name.
 */
function buildMessageAgentMap(
  messages: ChatMessage[],
  agentMessages: AgentMessage[],
): Map<string, AgentMessage[]> {
  const map = new Map<string, AgentMessage[]>();
  const consumed = new Set<string>(); // consumed agent message IDs

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const msgAgents: AgentMessage[] = [];

    for (const part of message.parts) {
      const type =
        typeof part === "object" && part !== null && "type" in part
          ? (part as { type: string }).type
          : undefined;
      if (typeof type === "string" && type.startsWith("tool-")) {
        const toolName = type.slice("tool-".length);
        // Find the first unconsumed agent message matching this tool name
        let match = agentMessages.find(
          (am) => !consumed.has(am.id) && toToolName(am.agentName) === toolName,
        );

        // For "task" tool calls, match by input.subagent_type
        if (!match && toolName === "task") {
          const input = (part as Record<string, unknown>).input as Record<string, unknown> | undefined;
          const subagentType = typeof input?.subagent_type === "string" ? input.subagent_type : undefined;
          if (subagentType) {
            match = agentMessages.find(
              (am) => !consumed.has(am.id) && toToolName(am.agentName) === subagentType,
            );
          }
          // Fallback: match next available agent by order
          if (!match) {
            match = agentMessages.find((am) => !consumed.has(am.id));
          }
        }

        if (match) {
          consumed.add(match.id);
          msgAgents.push(match);
        }
      }
    }

    if (msgAgents.length > 0) {
      map.set(message.id, msgAgents);
    }
  }

  return map;
}

type MessagesProps = {
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  addToolApprovalResponse?: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  isProcessing: boolean;
  selectedModelId: string;
  agentMessages?: AgentMessage[];
  /** Parent chat ID for sub-agent session continuation */
  parentChatId?: string;
  /** Sub-agent session registry from Chat.lastContext */
  subAgentSessions?: SubAgentSessionInfo[];
};

function PureMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  sendMessage,
  regenerate,
  addToolApprovalResponse,
  isReadonly,
  isProcessing,
  selectedModelId,
  agentMessages = [],
  parentChatId,
  subAgentSessions,
}: MessagesProps) {
  console.log("[PureMessages] RENDER - status:", status, "agentMessages:", agentMessages.length, "isProcessing:", isProcessing);
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  // Build per-message agent mapping: each assistant message gets only the
  // AgentMessage(s) that belong to its tool calls, not the entire list.
  // This prevents the Nth "City Weather Agent" from stealing another's data.
  const messageAgentMap = useMemo(
    () => buildMessageAgentMap(messages, agentMessages),
    [messages, agentMessages],
  );

  // Scroll to bottom instantly when switching to a different chat
  useEffect(() => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "instant",
        });
      }
    });
  }, [chatId, messagesContainerRef]);

  useEffect(() => {
    if (status === "submitted") {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
          });
        }
      });
    }
  }, [status, messagesContainerRef]);

  return (
    <div
      className="overscroll-behavior-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-scroll"
      ref={messagesContainerRef}
      style={{ overflowAnchor: "none" }}
    >
      <Conversation className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 md:gap-6">
        <ConversationContent className="flex flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && <Greeting />}

          {messages.map((message, index) => (
            <PreviewMessage
              agentMessages={messageAgentMap.get(message.id) ?? []}
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              parentChatId={parentChatId}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              sendMessage={sendMessage}
              setMessages={setMessages}
              addToolApprovalResponse={addToolApprovalResponse}
              subAgentSessions={subAgentSessions}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          <AnimatePresence mode="wait">
            {(status === "submitted" || isProcessing) &&
              agentMessages.length === 0 && (
                <ThinkingMessage key="thinking" />
              )}
          </AnimatePresence>

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </ConversationContent>
      </Conversation>

      {/* {!isAtBottom && (
        <button
          aria-label="Scroll to bottom"
          className="-translate-x-1/2 absolute bottom-40 left-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-colors hover:bg-muted"
          onClick={() => scrollToBottom("smooth")}
          type="button"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      )} */}
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) {
    console.log("[Messages memo] SKIP - both artifact visible");
    return true;
  }

  // During streaming, always re-render to pick up text-delta updates.
  // useChat with experimental_throttle may reuse the same messages reference,
  // and fast-deep-equal short-circuits on reference equality (===),
  // preventing detection of in-place content mutations.
  // This mirrors the same fix in PreviewMessage's memo (isLoading check).
  if (nextProps.status === "streaming") {
    return false;
  }

  if (prevProps.isProcessing !== nextProps.isProcessing) {
    console.log("[Messages memo] RE-RENDER - isProcessing changed:", prevProps.isProcessing, "->", nextProps.isProcessing);
    return false;
  }
  if (prevProps.status !== nextProps.status) {
    console.log("[Messages memo] RE-RENDER - status changed:", prevProps.status, "->", nextProps.status);
    return false;
  }
  if (prevProps.selectedModelId !== nextProps.selectedModelId) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    console.log("[Messages memo] RE-RENDER - messages length changed:", prevProps.messages.length, "->", nextProps.messages.length);
    return false;
  }
  if (!equal(prevProps.messages, nextProps.messages)) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }
  if (!equal(prevProps.agentMessages, nextProps.agentMessages)) {
    console.log("[Messages memo] RE-RENDER - agentMessages changed:", prevProps.agentMessages?.length, "->", nextProps.agentMessages?.length);
    return false;
  }

  console.log("[Messages memo] SKIP - no changes");
  return true;
});
