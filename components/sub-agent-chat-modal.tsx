"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { BotIcon, LoaderIcon, XIcon } from "lucide-react";
import { generateUUID, fetchWithErrorHandlers } from "@/lib/utils";
import { IMBRACE_ORG_ID_KEY, IMBRACE_TOKEN_KEY } from "@/lib/imbrace/constants";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import type { AgentMessage } from "@/hooks/use-multi-session";
import type { ChatMessage } from "@/lib/types";
import type { Attachment } from "@/lib/types";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { StatusBadge } from "./sub-agent-shared";
import { useTranslation } from "@/lib/i18n/client";

interface SubAgentChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentMessage: AgentMessage;
  /** Parent chat ID for sub-agent session continuation */
  parentChatId?: string;
  /** Existing session ID from Chat.lastContext.subAgentSessions */
  existingSessionId?: string;
}

/**
 * Fullscreen modal for chatting directly with a sub-agent.
 *
 * When an existing session is available (parentChatId + existingSessionId),
 * loads history from the server and reuses the session instead of creating
 * a new chat record. Otherwise falls back to creating a new chat.
 *
 * Reuses the same useChat + DefaultChatTransport + /api/v2/chat endpoint,
 * Messages component, and MultimodalInput as the main Chat page.
 */
export function SubAgentChatModal({
  open,
  onOpenChange,
  agentMessage,
  parentChatId,
  existingSessionId,
}: SubAgentChatModalProps) {
  const { t } = useTranslation("");
  // Reason: Use a stable ID based on existingSessionId when reusing a session,
  // so reopening the modal for the same session reuses the same useChat instance.
  const subChatIdRef = useRef(
    existingSessionId ? `sub-agent-${existingSessionId}` : generateUUID(),
  );
  const [isReady, setIsReady] = useState(false);
  const initRef = useRef(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const hasExistingSession = !!(parentChatId && existingSessionId);

  const getCredentials = useCallback(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(IMBRACE_TOKEN_KEY)
        : null;
    const orgId =
      typeof window !== "undefined"
        ? localStorage.getItem(IMBRACE_ORG_ID_KEY)
        : null;
    return { token, orgId };
  }, []);

  const transport = useMemo(() => {
    const assistantId = agentMessage.assistantId;
    return new DefaultChatTransport({
      // Reason: Use the sub-agent-chat endpoint when reusing an existing session,
      // as it supports session_id + chat_id for history loading and exchange persistence.
      api: hasExistingSession ? "/ai-agent/v2/sub-agent-chat" : "/ai-agent/v2/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const { token, orgId } = getCredentials();
        if (!token || !orgId) throw new Error(t("Chat.missingToken"));

        const isJwt = token.startsWith("eyJ");
        const headers: Record<string, string> = {
          "x-organization-id": orgId,
          "x-access-token": token,
        };
        if (isJwt) headers.Authorization = `Bearer ${token}`;

        return {
          headers,
          body: {
            id: request.id,
            // Reason: Send UIMessages directly. The server's toModelMessages()
            // helper handles either UIMessage or ModelMessage shape.
            messages: request.messages.slice(-1),
            streamId: request.id,
            assistant_id: assistantId,
            organization_id: orgId,
            // Reason: Pass session_id and chat_id so the server can load
            // prior conversation history and save follow-up exchanges.
            ...(hasExistingSession && {
              session_id: existingSessionId,
              chat_id: parentChatId,
            }),
          },
        };
      },
    });
  }, [agentMessage.assistantId, getCredentials, hasExistingSession, existingSessionId, parentChatId]);

  const {
    messages,
    sendMessage,
    status,
    stop,
    setMessages,
    regenerate,
  } = useChat<ChatMessage>({
    id: subChatIdRef.current,
    messages: [],
    experimental_throttle: 100,
    generateId: generateUUID,
    transport,
  });

  // Initialize modal on first open
  useEffect(() => {
    if (!open || initRef.current || !agentMessage.assistantId) return;
    initRef.current = true;

    (async () => {
      const { token, orgId } = getCredentials();
      if (!token || !orgId) return;

      try {
        if (hasExistingSession) {
          // Reason: Reuse existing session — load history from server instead
          // of creating a new chat record. This prevents DB bloat and preserves
          // conversation continuity across modal open/close cycles.
          const isJwt = token.startsWith("eyJ");
          const historyHeaders: Record<string, string> = {
            "x-access-token": token,
            "x-organization-id": orgId,
          };
          if (isJwt) historyHeaders.Authorization = `Bearer ${token}`;

          const historyRes = await fetch(
            `/ai-agent/v2/sub-agent-chat/history?session_id=${encodeURIComponent(existingSessionId!)}&chat_id=${encodeURIComponent(parentChatId!)}`,
            { headers: historyHeaders },
          );

          if (historyRes.ok) {
            const { messages: historyMessages } = await historyRes.json();

            // Convert history messages to ChatMessage format for useChat
            const seedMessages: ChatMessage[] = (historyMessages || []).map(
              (msg: { role: string; content: string }) => ({
                id: generateUUID(),
                role: msg.role as "user" | "assistant",
                parts: [{ type: "text", text: msg.content }],
              } as ChatMessage),
            );

            // Also prepend the sub-agent's original response if not in history
            if (seedMessages.length === 0 && agentMessage.text) {
              seedMessages.push({
                id: generateUUID(),
                role: "assistant",
                parts: [{ type: "text", text: agentMessage.text }],
              } as ChatMessage);
            }

            setMessages(seedMessages);
          } else {
            // Fallback: show at least the current agent text
            if (agentMessage.text) {
              setMessages([
                {
                  id: generateUUID(),
                  role: "assistant",
                  parts: [{ type: "text", text: agentMessage.text }],
                } as ChatMessage,
              ]);
            }
          }

          setIsReady(true);
        } else {
          // No existing session — create a new chat record (original behavior)
          const chatId = subChatIdRef.current;
          const userMsgId = generateUUID();
          const assistantMsgId = generateUUID();

          // 1. Create chat record with a seed user message
          const { getClientApi } = await import("@/lib/api/clientApi");
          await getClientApi().createChat({
            id: chatId,
            message: {
              id: userMsgId,
              role: "user",
              parts: [
                {
                  type: "text",
                  text: `Continue conversation with ${agentMessage.agentName}`,
                },
              ],
            },
            selectedVisibilityType: "private",
            assistantId: agentMessage.assistantId,
            organizationId: orgId,
            type: "sub-agent",
          });

          // 2. Seed the sub-agent's existing response (TEXT only)
          if (agentMessage.text) {
            const { getClientApi: getApi } = await import("@/lib/api/clientApi");
            await getApi().saveMessage({
              message: {
                id: assistantMsgId,
                chatId,
                role: "assistant",
                parts: [{ type: "text", text: agentMessage.text }],
              },
            });
          }

          // 3. Set initial messages in useChat
          const seedMessages: ChatMessage[] = [];
          if (agentMessage.text) {
            seedMessages.push({
              id: assistantMsgId,
              role: "assistant",
              parts: [{ type: "text", text: agentMessage.text }],
            } as ChatMessage);
          }

          setMessages(seedMessages);
          setIsReady(true);
        }
      } catch (err) {
        console.error("[SubAgentChatModal] Init failed:", err);
      }
    })();
  }, [open, agentMessage, getCredentials, setMessages, hasExistingSession, existingSessionId, parentChatId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-xl border bg-background shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 md:inset-4">
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
              <BotIcon className="size-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Dialog.Title className="text-sm font-semibold truncate">
                {agentMessage.agentName}
              </Dialog.Title>
              <StatusBadge status={agentMessage.status} />
            </div>
            <Dialog.Close className="rounded-sm p-1.5 opacity-70 transition-opacity hover:opacity-100">
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>

          {/* Body — reuses the same Messages + MultimodalInput as main chat */}
          {isReady ? (
            <>
              <Messages
                chatId={subChatIdRef.current}
                messages={messages}
                setMessages={setMessages}
                sendMessage={sendMessage}
                regenerate={regenerate}
                status={status}
                votes={undefined}
                isReadonly={false}
                isArtifactVisible={false}
                isProcessing={false}
                selectedModelId={DEFAULT_CHAT_MODEL}
              />

              <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl flex-col gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
                <MultimodalInput
                  chatId={subChatIdRef.current}
                  input={input}
                  setInput={setInput}
                  status={status}
                  stop={stop}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  messages={messages}
                  setMessages={setMessages}
                  sendMessage={sendMessage}
                  selectedModelId={DEFAULT_CHAT_MODEL}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <LoaderIcon className="mr-2 size-4 animate-spin" />
              {t("Chat.initializingChat")}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
